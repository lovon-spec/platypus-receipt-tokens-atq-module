# Platypus Finance receipt token ATQ draft

Returns Avalanche liquidity deposit receipt token addresses from outputToken of Messari Platypus Finance LiquidityPool entities. It does not tag entity IDs or underlying assets. Records with no identified output token are excluded. All pages use one indexed block hash and a complete unique ID cursor. Repeated receipt addresses fail the call.

Official Messari deployment catalogue: https://github.com/messari/subgraphs/blob/master/deployment/decentralized_network_deployments.csv

Use Yarn and yarn build, then import returnTags from dist/main.mjs. The caller supplies the chain ID and Graph API key. This is a local unpublished preparation draft with no review or filing authority.
