#!/bin/sh
cd $(dirname "$0")
./tsukifuda.elf > ./log.txt 2>&1
