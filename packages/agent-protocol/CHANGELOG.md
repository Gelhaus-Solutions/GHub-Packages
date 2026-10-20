# @ghub/agent-protocol

## 0.1.0

### Minor Changes

- 8d5b7eb: First release: the server half of the GOpen agents' wire protocol, moved here from GOpenCDR's api so GOpenCDR and GOpenCNR check their agents' requests with one implementation. Request assertions bound to the audience, method, path and body for a minute, key proofs for rotation, RFC 7638 key ids with weak keys refused, each product naming its own scheme, types, paths and agent ids. A testing entry signs as an agent would. No dependencies.
