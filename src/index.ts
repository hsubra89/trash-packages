
import * as core from '@actions/core'
import ms from 'ms'
import { runAction } from './action'

async function init() {

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN

  if (!GITHUB_TOKEN) {
    core.setFailed(`Env "GITHUB_TOKEN" not set. Is this running in a "Github Actions" environment?`)
  } else {

    const owner = core.getInput('owner')
    const repo = core.getInput('repo')
    const minAge = ms(core.getInput('minAge', { required: true }))
    const maxDownloads = parseInt(core.getInput('maxDownloads'), 10) || 0
    const packageType = core.getInput('packageType') || 'docker'

    await runAction(GITHUB_TOKEN, { minAge, maxDownloads, repo, owner, packageType })
  }
}

init()
