const { hash: namehash } = require('eth-ens-namehash')
const getAccounts = require('@aragon/os/scripts/helpers/get-accounts')
const logDeploy = require('@aragon/os/scripts/helpers/deploy-logger')

const globalArtifacts = this.artifacts // Not injected unless called directly via truffle
const globalWeb3 = this.web3 // Not injected unless called directly via truffle

const errorOut = message => {
  console.error(message)
  throw new Error(message)
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

const dePoolTemplateName = 'depool-template'
const dePoolTld = `depoolspm.eth`

const defaultOwner = process.env.OWNER
const defaultDaoFactoryAddress = process.env.DAO_FACTORY || '0x5d94e3e7aec542ab0f9129b9a7badeb5b3ca0f77'
const defaultENSAddress = process.env.ENS || '0x5f6f7e8cc7346a11ca2def8f827b7a0b612c56a1'
const defaultMiniMeFactoryAddress = process.env.MENIME_FACTORY || '0xd526b7aba39cccf76422835e7fd5327b98ad73c9'
const defaultApmRegistryAddress = process.env.APM || '0x1902a0410EFe699487Dd85F12321aD672bE4ada2' //depoolspm

const apps = [
  { name: 'steth', contractName: 'StETH' },
  { name: 'depool', contractName: 'DePool' },
  { name: 'depooloracle', contractName: 'DePoolOracle' },
]

const _isPackageRegistered = async (ens, name, tld) => {
  const owner = await ens.owner(namehash(`${name}.${tld}`))
  return owner !== ZERO_ADDR && owner !== '0x'
}

module.exports = async (truffleExecCallback, {
  artifacts = globalArtifacts,
  web3 = globalWeb3,
  ensAddress = defaultENSAddress,
  owner = defaultOwner,
  daoFactoryAddress = defaultDaoFactoryAddress,
  miniMeFactoryAddress = defaultMiniMeFactoryAddress,
  apmRegistryAddress = defaultApmRegistryAddress,
  verbose = true,
} = {}) => {
  const log = (...args) => {
    if (verbose) {
      console.log(...args)
    }
  }

  if (!web3) errorOut('Missing "web3" object. This script must be run with a "web3" object globally defined, for example through "truffle exec".')
  if (!artifacts) errorOut('Missing "artifacts" object. This script must be run with an "artifacts" object globally defined, for example through "truffle exec".')
  if (!ensAddress) errorOut('Missing ENS address. Please specify one using ENS env var')
  if (!daoFactoryAddress) errorOut('Missing DAO Factory address. Please specify one using DAO_FACTORY env var')
  if (!miniMeFactoryAddress) errorOut('Missing MiniMe Factory address. Please specify one using MENIME_FACTORY env var')
  if (!apmRegistryAddress) errorOut('Missing APM Registry address. Please specify one using APM env var')

  const accounts = await getAccounts(web3)
  if (!owner) {
    owner = accounts[0]
    log('OWNER env variable not found, setting owner to the provider\'s first account')
  }
  log('Owner:', owner)

  try {
    const APMRegistry = artifacts.require('APMRegistry')
    // const DAOFactory = artifacts.require('DAOFactory')
    // const MiniMeTokenFactory = artifacts.require('MiniMeTokenFactory')
    const ENS = artifacts.require('ENS')
    const DePoolTemplate = artifacts.require('DePoolTemplate')

    const ens = await ENS.at(ensAddress)
    log(`Using provided ENS: ${ens.address}`)

    const apm = await APMRegistry.at(apmRegistryAddress)
    log(`Using provided APM Registry: ${apm.address}`)

    // const daoFactory = await DAOFactory.at(daoFactoryAddress)
    // const hasEVMScripts = (await daoFactory.regFactory()) !== ZERO_ADDR
    // log(
    //   `Using provided DAOFactory (with${
    //     hasEVMScripts ? '' : 'out'
    //   } EVMScripts):`,
    //   daoFactory.address
    // )
    // const miniMeFactory = await MiniMeTokenFactory.at(miniMeFactoryAddress)
    // log(`Using provided MiniMeTokenFactory: ${miniMeFactory.address}`)

    log('=========')
    log('Check Apps...')

    for (const { name, contractName } of apps) {
      if (await _isPackageRegistered(ens, name, dePoolTld)) {
        log(`Using registered ${contractName} app`)
      } else {
        errorOut(`No ${contractName} app registered`)
      }
    }
    if ((await _isPackageRegistered(ens, dePoolTemplateName, dePoolTld))) {
      errorOut("Template already registered")
    }

    log(`Deploying template: ${dePoolTemplateName}`)
    const template = await DePoolTemplate.new(daoFactoryAddress, ensAddress, miniMeFactoryAddress, { gas: 6000000})
    await logDeploy(template)

    log(`Deployed DePoolTemplate: ${template.address}`)

    log(`Registering package for DePoolTemplate as "${dePoolTemplateName}.${dePoolTld}"`)
    const receipt = await apm.newRepoWithVersion(dePoolTemplateName, owner, [1, 0, 0], template.address, '0x0', { from: owner })
    // log(receipt)

    if (typeof truffleExecCallback === 'function') {
      // Called directly via `truffle exec`
      truffleExecCallback()
    } else {
      return {
        template: template.address,
      }
    }
  } catch (e) {
    if (typeof truffleExecCallback === 'function') {
      truffleExecCallback(e)
    } else {
      throw e
    }
  }
}
