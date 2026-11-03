// Package agentcore is what every Gelhaus Open agent shares: GOpenCNR's agent on members'
// routers and hubs, and GOpenCDR's mirror agent. It holds the agent's Ed25519 key, signs every
// request to the control plane as a compact JWS bound to the request, and signs proofs of the key
// bound to no request; enrols the key with a single-use token, fetches the signed bundle and raw
// files, long-polling for the bundle where the control plane holds a request (Prefer: wait),
// verifies the bundle against the key pinned in the release and refuses any serial below
// the last one accepted, puts the files a bundle renders in place atomically, rolling back on a
// failed reload or probe and, for a risky change, unless it is confirmed in its window, or for a
// forward change never, and posts reports.
//
// It knows no product. The Authorization scheme, the JWS type, the paths and the payloads are
// the caller's: GOpenCDR's mirror protocol is one configuration, GOpenCNR's is another. It
// depends on the standard library and golang.org/x/mod alone, and it is released as
// packages/agentcore/vX.Y.Z tags of GHub-Packages, public under the Elastic License 2.0.
package agentcore
