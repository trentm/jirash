# Functions for Bash completion of some 'jirash' option/arg types.

# XXX


#
# Get completions for a given type of Triton (server-side) data.
#
# Usage:
#   _complete_tritondata $type    # e.g. _complete_tritondata images
#
# The easiest/slowest thing to do to complete images would be to just call:
#       triton [profile-related-args] images -Ho name
# or similar. Too slow.
#
# The next easiest would be this:
#       candidates=$(TRITON_COMPLETE=$type $COMP_LINE)
# where `triton` is setup to specially just handle completions if
# `TRITON_COMPLETE` is set. That special handling writes out a cache file to
# avoid hitting the server every time. This is still too slow because the
# node.js startup time for `triton` is too slow (around 1s on my laptop).
#
# The next choice is to (a) use the special `TRITON_COMPLETE` handling to
# fetch data from the server and write out a cache file, but (b) attempt to
# find and use that cache file without calling node.js code. The win is
# (at least in my usage) faster response time to a <TAB>. The cost is
# reproducing (imperfectly) in Bash the logic for determining the Triton profile
# info to find the cache.
#
function _complete_tritondata {
    local type=$1

    # First, find the Triton CLI profile.
    local profile
    profile=$(echo "$COMP_LINE" | grep -- '\s\+-p\s*\w\+\s\+' | sed -E 's/.* +-p *([^ ]+) +.*/\1/')
    if [[ -z "$profile" ]]; then
        profile=$TRITON_PROFILE
    fi
    if [[ -z "$profile" ]]; then
        profile=$(grep '"profile":' ~/.triton/config.json | cut -d'"' -f4)
    fi
    if [[ -z "$profile" ]]; then
        profile=env
    fi
    trace "    profile: $profile"

    # Then, determine the account and url that go into the cache dir.
    # TODO: include -a/-U options that change from profile values
    # TODO: subuser support
    local url
    local account
    local profileFile
    profileFile=$HOME/.triton/profiles.d/$profile.json
    if [[ "$profile" == "env" ]]; then
        url=$TRITON_URL
        if [[ -z "$url" ]]; then
            url=$SDC_URL
        fi
        account=$TRITON_ACCOUNT
        if [[ -z "$account" ]]; then
            account=$SDC_ACCOUNT
        fi
    elif [[ -f $profileFile ]]; then
        url=$(grep '"url":' $profileFile | cut -d'"' -f4)
        account=$(grep '"account":' $profileFile | cut -d'"' -f4)
    fi
    trace "    url: $url"
    trace "    account: $account"

    # Mimic node-triton/lib/common.js#profileSlug
    local profileSlug
    profileSlug="$(echo "$account" | sed -E 's/@/_/g')@$(echo "$url" | sed -E 's#^https?://##')"
    profileSlug="$(echo "$profileSlug" | sed -E 's/[^a-zA-Z0-9_@-]/_/g')"

    local cacheFile
    cacheFile="$HOME/.triton/cache/$profileSlug/$type.completions"
    trace "    cacheFile: $cacheFile"

    # If we have a cache file, remove it and regenerate if it is >5 minutes old.
    #
    # Dev Note: This 5min TTL should match what `lib/cli.js#_emitCompletions()`
    # is using.
    local candidates
    if [[ ! -f "$cacheFile" ]]; then
        candidates=$(TRITON_COMPLETE=$type $COMP_LINE)
    else
        local mtime
        mtime=$(stat -r "$cacheFile" | awk '{print $10}')
        local ttl=300  # 5 minutes in seconds
        local age
        age=$(echo "$(date +%s) - $mtime" | bc)
        if [[ $age -gt $ttl ]]; then
            # Out of date. Regenerate the cache file.
            trace "    cacheFile out-of-date (mtime=$mtime, age=$age, ttl=$ttl)"
            rm "$cacheFile"
            candidates=$(TRITON_COMPLETE=$type $COMP_LINE)
        else
            trace "    cacheFile is in-date (mtime=$mtime, age=$age, ttl=$ttl)"
            candidates=$(cat "$cacheFile")
        fi
    fi

    echo "$candidates"
}

function complete_tritonimage {
    local word="$1"
    candidates=$(_complete_tritondata images)
    compgen $compgen_opts -W "$candidates" -- "$word"
}



function complete_tritonupdateaccountfield {
    local word="$1"
    local candidates
    candidates="{{UPDATE_ACCOUNT_FIELDS}}"
    compgen $compgen_opts -W "$candidates" -- "$word"
}
