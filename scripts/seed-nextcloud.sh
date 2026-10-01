#!/usr/bin/env bash
#
# Seed a Nextcloud instance with Deck boards, stacks, labels, cards and comments.
#
#   NC_URL=https://cloud.example.com NC_USER=admin NC_PASS=secret ./seed-nextcloud.sh
#
# Options:
#   -n, --dry-run          print what would be sent, do not touch the server
#   -w, --weeks N          spread due dates over the next N weeks (default 4)
#   -b, --boards N         number of boards to create (default 10, max 10)
#   -c, --cards N          max cards per stack (default 4)
#   -s, --seed N           RNG seed for reproducible data (default 42)
#       --wipe             delete the seeded boards instead of creating them
#
# Requires curl and jq. Runs on the bash 3.2 shipped with macOS.
set -uo pipefail

NC_URL="${NC_URL:-}"
NC_USER="${NC_USER:-admin}"
NC_PASS="${NC_PASS:-}"
NC_URL="${NC_URL%/}"

WEEKS=4
NBOARDS=10
MAXCARDS=4
DRY_RUN=0
WIPE=0
SEED=42

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1; shift ;;
    -w|--weeks)   WEEKS="$2"; shift 2 ;;
    -b|--boards)  NBOARDS="$2"; shift 2 ;;
    -c|--cards)   MAXCARDS="$2"; shift 2 ;;
    -s|--seed)    SEED="$2"; shift 2 ;;
    --wipe)       WIPE=1; shift ;;
    -h|--help)    sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null || { echo "jq is required." >&2; exit 1; }

if [[ $DRY_RUN -eq 0 && -z "$NC_URL" ]]; then
  echo "NC_URL is empty." >&2
  exit 1
fi
if [[ $DRY_RUN -eq 0 && -z "$NC_PASS" ]]; then
  echo "NC_PASS is empty. Export it (an app password is preferred over the account password)." >&2
  exit 1
fi

REST="$NC_URL/index.php/apps/deck/api/v1.1"
OCS="$NC_URL/ocs/v2.php/apps/deck/api/v1.1"

RANDOM=$SEED

BOARDS=(
  "Refonte app mobile|0082c9|Backlog;À faire;En cours;En revue;Terminé|Écran de connexion;Mode hors ligne;Notifications push;Thème sombre;Recherche globale;Synchro en arrière-plan;Accessibilité VoiceOver;Widget écran d'accueil;Migration Expo SDK;Crash au démarrage Android"
  "Maison et travaux|9e9e9e|À prévoir;Devis demandés;En cours;Fini|Repeindre la chambre;Changer le chauffe-eau;Réparer la fuite cuisine;Poser des étagères;Nettoyer les gouttières;Isolation des combles;Tailler la haie"
  "Vacances d'été|ff7a00|Idées;À réserver;Réservé;Sur place|Billets de train;Location voiture;Hôtel à Lisbonne;Assurance voyage;Visite du musée;Liste de bagages;Restaurant Time Out Market"
  "Recrutement|e9322d|Candidatures;Entretien RH;Test technique;Entretien final;Offre envoyée|Camille Roy - Dev mobile;Nina Aubert - Product owner;Marc Diallo - Backend;Sofia Bianchi - Designer;Théo Martin - QA;Léa Garnier - DevOps;Hugo Lefèvre - Stagiaire"
  "Association sportive|46ba61|À faire;En cours;Fait|Inscriptions saison;Commande maillots;Réserver le gymnase;Organiser le tournoi;Assemblée générale;Demande de subvention;Site web du club"
  "Lectures|7c4dff|À lire;En cours;Lu|L'Étranger;Dune;Sapiens;Le Petit Prince;1984;Les Misérables;Clean Code;Le Comte de Monte-Cristo"
  "Factures et administratif|607d8b|À traiter;En attente;Réglé|Déclaration d'impôts;Renouveler passeport;Facture internet;Assurance habitation;Taxe foncière;Résilier abonnement salle;Carte grise"
  "Support client|b8308a|Nouveaux tickets;En analyse;En attente client;Résolu|Impossible de se connecter;Export PDF vide;Doublons dans la synchro;Lenteur au chargement;Demande de remboursement;Erreur 500 sur l'API;Notification en double"
  "Événement entreprise|ff4081|Idées;Organisation;Prêt|Choix du lieu;Traiteur;Invitations;Animation DJ;Goodies;Plan de table;Photographe"
  "Ancien projet|795548|À faire;En cours;Fait|Maquettes v1;Prototype;Tests utilisateurs;Bilan|archived"
)

LABELS=("Urgent|e9322d" "Bug|b8308a" "Idée|7c4dff" "Client|ff7a00" "Bloqué|795548")

COMMENTS="Je regarde ça demain.;Bloqué en attendant le retour client.;C'est bon de mon côté 👍;On en parle au prochain point ?;J'ai ajouté des précisions dans la description.;Testé sur Android et iOS, RAS."

pick() {
  local IFS=';' arr
  read -ra arr <<< "$1"
  PICK="${arr[$((RANDOM % ${#arr[@]}))]}"
}

CODE=""
RESP=""
api() {
  local method="$1" url="$2" body="${3:-}" attempt=0 delay=15 tmp
  if [[ $DRY_RUN -eq 1 ]]; then
    CODE=200
    if [[ $method == GET ]]; then RESP='[]'; else RESP='{"id":0}'; fi
    return 0
  fi
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w '%{http_code}' -u "$NC_USER:$NC_PASS" -X "$method"
              -H 'OCS-APIRequest: true' -H 'Accept: application/json')
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary "$body")
  while :; do
    CODE=$(curl "${args[@]}" "$url")
    if [[ "$CODE" == "429" && $attempt -lt 6 ]]; then
      attempt=$((attempt + 1))
      echo "    throttled (429), retry $attempt/6 in ${delay}s" >&2
      sleep "$delay"
      delay=$((delay * 2))
      continue
    fi
    break
  done
  RESP="$(cat "$tmp")"
  rm -f "$tmp"
}

ID=""
declare -a FAILURES=()
send() {
  api "$@"
  if [[ "$CODE" == "200" ]]; then
    ID="$(jq -r 'objects | .ocs.data.id // .id // empty' <<< "$RESP")"
    return 0
  fi
  FAILURES+=("$1 ${2#"$NC_URL"} -> $CODE ${RESP:0:160}")
  return 1
}

EXISTING=""
load_existing() {
  api GET "$REST/boards"
  if [[ "$CODE" != "200" ]]; then
    echo "GET /boards -> $CODE ${RESP:0:160}" >&2
    exit 1
  fi
  EXISTING="$(jq -r --arg u "$NC_USER" '.[]
    | select(.deletedAt == 0 and ((.owner | objects | .uid) // .owner) == $u)
    | "\(.id)|\(.title)"' <<< "$RESP")"
}

board_ids() {
  printf '%s\n' "$EXISTING" | awk -F'|' -v t="$1" '$2 == t { print $1 }'
}

card_body() {
  jq -nc --arg t "$1" --arg d "$2" --argjson o "$3" --argjson due "$4" \
    --argjson done "$5" --arg u "$NC_USER" '
    {title: $t, type: "plain", order: $o, description: $d,
     duedate: (if $due > 0 then ($due | todate) else null end)}
    + (if $done then {owner: $u, done: (now | floor | todate)} else {} end)'
}

if [[ $WIPE -eq 1 ]]; then
  echo "Deleting seeded boards on $REST (Deck keeps them in its trash until purged)"
  load_existing
  for entry in "${BOARDS[@]:0:$NBOARDS}"; do
    IFS='|' read -r title _ <<< "$entry"
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "  [dry] DELETE $title"
      continue
    fi
    for id in $(board_ids "$title"); do
      api DELETE "$REST/boards/$id"
      echo "  - $title ($id) -> $CODE"
    done
  done
  exit 0
fi

NOW=$(date +%s)
DAY0=$((NOW - NOW % 86400))
HORIZON=$((WEEKS * 7))
TOTAL=0

echo "Target : $REST"
echo "Due    : -7 -> +$HORIZON days"
echo "Boards : $NBOARDS"
[[ $DRY_RUN -eq 1 ]] && echo "Mode   : DRY RUN"
echo

load_existing

for entry in "${BOARDS[@]:0:$NBOARDS}"; do
  IFS='|' read -r title color stacks pool flag <<< "$entry"

  if [[ -n "$(board_ids "$title")" ]]; then
    echo "  = board $title -> exists"
    continue
  fi
  if ! send POST "$REST/boards" "$(jq -nc --arg t "$title" --arg c "$color" '{title: $t, color: $c}')"; then
    echo "  ! board $title -> $CODE (skipped)"
    continue
  fi
  board="$ID"
  echo "  + board $title"

  label_ids=()
  for l in "${LABELS[@]}"; do
    IFS='|' read -r lt lc <<< "$l"
    send POST "$REST/boards/$board/labels" "$(jq -nc --arg t "$lt" --arg c "$lc" '{title: $t, color: $c}')" \
      && label_ids+=("$ID")
  done
  nlabels=${#label_ids[@]}

  IFS=';' read -ra stack_names <<< "$stacks"
  IFS=';' read -ra titles <<< "$pool"
  nstacks=${#stack_names[@]}
  ci=$((RANDOM % ${#titles[@]}))
  count_board=0

  for (( s = 0; s < nstacks; s++ )); do
    send POST "$REST/boards/$board/stacks" \
      "$(jq -nc --arg t "${stack_names[$s]}" --argjson o "$s" '{title: $t, order: $o}')" || continue
    stack="$ID"
    is_done=false
    (( s == nstacks - 1 )) && is_done=true
    ncards=$((1 + RANDOM % MAXCARDS))

    for (( k = 0; k < ncards; k++ )); do
      card_title="${titles[$((ci % ${#titles[@]}))]}"
      ci=$((ci + 1))

      case $((RANDOM % 4)) in
        0) desc="" ;;
        1) desc="$card_title - jeu de test ($title)." ;;
        2) desc=$'## Sous-tâches\n\n- [x] Analyser le besoin\n- [ ] Faire une proposition\n- [ ] Valider avec l\'équipe' ;;
        3) desc=$'**Contexte** : carte générée pour le jeu de test.\n\nVoir [la documentation](https://deck.readthedocs.io).' ;;
      esac

      r=$((RANDOM % 10))
      if (( r < 3 )); then off=""
      elif (( r < 5 )); then off=$((-1 - RANDOM % 7))
      elif (( r < 7 )); then off=0
      else off=$((1 + RANDOM % HORIZON))
      fi
      due=0
      [[ -n "$off" ]] && due=$((DAY0 + off * 86400 + (7 + RANDOM % 10) * 3600))

      send POST "$REST/boards/$board/stacks/$stack/cards" \
        "$(card_body "$card_title" "$desc" "$k" "$due" false)" || continue
      card="$ID"
      cpath="$REST/boards/$board/stacks/$stack/cards/$card"
      TOTAL=$((TOTAL + 1))
      count_board=$((count_board + 1))

      [[ $is_done == true ]] && send PUT "$cpath" "$(card_body "$card_title" "$desc" "$k" "$due" true)"

      if (( nlabels > 0 )); then
        first=$((RANDOM % nlabels))
        n=$((RANDOM % 3))
        for (( i = 0; i < n; i++ )); do
          send PUT "$cpath/assignLabel" "{\"labelId\":${label_ids[$(((first + i) % nlabels))]}}"
        done
      fi

      (( RANDOM % 2 == 0 )) && send PUT "$cpath/assignUser" "$(jq -nc --arg u "$NC_USER" '{userId: $u}')"

      if (( RANDOM % 4 == 0 )); then
        n=$((1 + RANDOM % 2))
        for (( i = 0; i < n; i++ )); do
          pick "$COMMENTS"
          send POST "$OCS/cards/$card/comments" "$(jq -nc --arg m "$PICK" '{message: $m}')"
        done
      fi

      [[ $is_done == true ]] && (( RANDOM % 3 == 0 )) && send PUT "$cpath/archive"
    done
  done

  if [[ "$flag" == "archived" ]]; then
    send PUT "$REST/boards/$board" \
      "$(jq -nc --arg t "$title" --arg c "$color" '{title: $t, color: $c, archived: true}')"
  fi

  echo "    $title: $count_board cards"
done

echo
echo "Done: $TOTAL cards across $NBOARDS boards"

if (( ${#FAILURES[@]} > 0 )); then
  echo "${#FAILURES[@]} failures:"
  for f in "${FAILURES[@]:0:20}"; do echo "  $f"; done
  exit 1
fi
