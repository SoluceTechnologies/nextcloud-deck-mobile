set dotenv-load := true
set positional-arguments

default:
    @just --list

seed *args:
    bash ./scripts/seed-nextcloud.sh "$@"

unseed *args:
    bash ./scripts/seed-nextcloud.sh --wipe "$@"

android:
    yarn android

ios:
    yarn ios
