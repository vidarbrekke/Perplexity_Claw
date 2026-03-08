#!/usr/bin/env bash

set -euo pipefail

REPO_PATH="${1:-/root/openclaw-stock-home/.openclaw/workspace/repositories/perplexity-claw}"
GIT_REMOTE="${GIT_REMOTE:-https://github.com/vidarbrekke/Perplexity_Claw.git}"
GIT_BRANCH="${GIT_BRANCH:-master}"
INSTALL_OPENCLAW="${INSTALL_OPENCLAW:-1}"
RESTART_GATEWAY="${RESTART_GATEWAY:-1}"
REFRESH_SKILL_METADATA="${REFRESH_SKILL_METADATA:-1}"

if [[ "${REPO_PATH}" == "" ]]; then
  echo "Usage: ${0} <repo-path>"
  exit 1
fi

echo "Deploying Perplexity Claw to: ${REPO_PATH}"
echo "Remote: ${GIT_REMOTE}"
echo "Branch: ${GIT_BRANCH}"

if [[ "${REPO_PATH}" == "/root"* ]]; then
  mkdir -p "$(dirname "${REPO_PATH}")"
  if [[ ! -w "$(dirname "${REPO_PATH}")" ]]; then
    echo "Insufficient permissions to write ${REPO_PATH}."
    echo "If this is a root-owned path, run with sudo or set REPO_PATH to a writable location."
    exit 1
  fi
else
  mkdir -p "${REPO_PATH}"
fi

cd "${REPO_PATH}"

if [[ ! -d ".git" ]]; then
  echo "Initializing git repository in ${REPO_PATH}"
  git init
  git remote add origin "${GIT_REMOTE}"
else
  echo "Git repository already exists; updating remote URL"
  git remote set-url origin "${GIT_REMOTE}"
fi

echo "Fetching latest from remote"
git fetch origin

if git show-ref --verify --quiet "refs/remotes/origin/${GIT_BRANCH}"; then
  git checkout -B "${GIT_BRANCH}" "origin/${GIT_BRANCH}"
  git pull --ff-only origin "${GIT_BRANCH}"
else
  echo "Branch ${GIT_BRANCH} not found on remote."
  git branch -a | sed -n "1,5p"
  exit 1
fi

git status -sb

if [[ "${INSTALL_OPENCLAW}" == "1" ]]; then
  if [[ -f "package.json" ]]; then
    echo "Running installer step (npm run install:openclaw)"
    npm run install:openclaw
  else
    echo "No package.json found; skipping install:openclaw."
  fi
else
  echo "SKIP_INSTALL_OPENCLAW=1, skipping npm run install:openclaw."
fi

if [[ "${RESTART_GATEWAY}" == "1" ]]; then
  if command -v openclaw >/dev/null 2>&1; then
    echo "Restarting OpenClaw gateway."
    if ! openclaw gateway restart; then
      echo "openclaw gateway restart failed. Continuing with warning since deploy completed."
    fi
  else
    echo "openclaw command not found. Skipping gateway restart."
  fi
else
  echo "RESTART_GATEWAY=0, skipping openclaw gateway restart."
fi

if [[ "${REFRESH_SKILL_METADATA}" == "1" ]]; then
  if command -v openclaw >/dev/null 2>&1; then
    echo "Refreshing OpenClaw skill metadata cache."
    if ! openclaw skills check > /tmp/openclaw-skills-check.log 2>&1; then
      echo "openclaw skills check failed; continuing. Check /tmp/openclaw-skills-check.log for details."
    fi
  else
    echo "openclaw command not found. Skipping OpenClaw skill metadata refresh."
  fi
else
  echo "REFRESH_SKILL_METADATA=0, skipping skill metadata refresh."
fi

echo "Deploy complete."
