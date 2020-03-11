
import axios from 'axios'
import * as core from '@actions/core'

export interface ActionSettings {
  owner: string
  repo: string
  minAge: number
  packageType: string
  maxDownloads: number
}

const FETCH_PACKAGE_VERSIONS_QUERY = `
query fetchPackageVersions($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    packages(first: 100) {
      totalCount
      nodes {
        id,
        name,
        versions(first: 100, orderBy: { field: CREATED_AT,  direction: ASC }) {
          nodes {
            id
            version
            package {
              packageType
            }
            files(first: 1) {
              nodes {
                updatedAt
              }
            }
            statistics {
              downloadsTotalCount
            }
          }
        }
      }
    }
  }
}
`

interface PackageVersions {
  data: {
    repository: {
      packages: {
        totalCount: number
        nodes: {
          id: string
          name: string
          versions: {
            nodes: {
              id: string
              version: string
              package: {
                packageType: 'NPM' | 'MAVEN' | 'RUBYGEMS' | 'DOCKER' | 'DEBIAN' | 'NUGET' | 'PYPI'
              }
              files: {
                nodes: {
                  updatedAt: string // DateTime
                }[]
              }
              statistics: {
                downloadsTotalCount: number
              }
            }[]
          }
        }[]
      }
    }
  }
}

interface MutationResponse {
  data: {
    [key: string]: {
      success: boolean
    }
  }
  errors?: {
    type: string
    path: string[]
    message: string
    locations: { line: number, column: number }[]
  }[]
}

function buildDeletePackageMutation(versionIds: string[]) {

  return `
mutation deletePackageVersion {
  ${ versionIds.map(vid => `${vid}: deletePackageVersion(input: {packageVersionId : "${vid}"}) { success }`).join('\n')}
}
  `
}

export async function runAction(githubToken: string, settings: ActionSettings) {

  const versions = await runGraphQLQuery<PackageVersions>(githubToken, FETCH_PACKAGE_VERSIONS_QUERY, { repo: settings.repo, owner: settings.owner })

  const beforeDate = Date.now() - settings.minAge

  // Filtering and Flattening packages!
  const flattenedVersions = versions.data.repository.packages.nodes
    .map(packageNodes => {
      const versionNodes = packageNodes.versions.nodes
        // Package Type Filter
        .filter(n => n.package.packageType === settings.packageType.toUpperCase())
        // Max downloads filter
        .filter(n => n.statistics.downloadsTotalCount <= settings.maxDownloads)
        // Max age filter
        .filter(n => {
          const fileNode = n.files.nodes[0]

          if (!fileNode) {
            return false
          } else {
            return Date.parse(fileNode.updatedAt).valueOf() <= beforeDate
          }
        })

      return {
        ...packageNodes,
        versions: {
          ...packageNodes.versions,
          nodes: versionNodes
        }
      }
    })

  // Deleting packages
  for (const fv of flattenedVersions) {
    core.info(`Package: ${fv.name}`)

    if (fv.versions.nodes.length === 0) {
      core.info(`-> No versions found that match deletion critera`)
    } else {
      const versionIds = fv.versions.nodes.map(n => n.id)
      const mutationQuery = buildDeletePackageMutation(versionIds)
      const result = await runGraphQLQuery<MutationResponse>(githubToken, mutationQuery)

      const errors = result.errors || []

      for (const [key, value] of Object.entries(result.data)) {

        if (!value || !value.success) {
          const relatedError = errors.find(e => e.path[0] === key)
          const resString = relatedError ? relatedError.message : 'Failed'
          core.error(`❌ ${key}: ${resString}`)
        } else {
          core.info(`✅ ${key}`)
        }
      }
    }

    core.info(``)
  }
}

/**
 * GraphQL query with custom Github preview feature Accept headers.
 */
function runGraphQLQuery<T>(githubToken: string, query: string, variables?: { [key: string]: string }) {
  return axios
    .post(`https://api.github.com/graphql`, {
      query,
      variables: JSON.stringify(variables)
    }, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.packages-preview+json,application/vnd.github.package-deletes-preview+json'
      }
    })
    .then(res => res.data as T)
}
