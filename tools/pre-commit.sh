#!/bin/bash

#
# A suggested git pre-commit hook for developers. Install it via:
#
#   make git-hooks
#

set -o errexit
set -o pipefail

make fmt
make check
#make test-unit
