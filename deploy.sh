#!/bin/sh

aws s3 sync "./" "s3://brick-web/ds/$1/script/gcprinter"