set dotenv-load := true
set positional-arguments

default:
    @just --list

android:
    yarn android

ios:
    yarn ios
