package agentcore_test

import (
	"context"
	"crypto/rand"
	"errors"
	"io/fs"
	"log"
	"net/netip"
	"os"
	"time"

	"github.com/gelhaus-solutions/ghub-packages/packages/agentcore"
)

// How GOpenCDR's mirror agent wires the core: its mirror protocol v1 is one Scheme, its paths and
// payloads are its own, and the core keeps the key, the signatures, the pinned bundle key and
// the serial floor.
func Example_mirrorAgent() {
	ctx := context.Background()
	scheme := agentcore.Scheme{Authorization: "GOCDR-Mirror", Type: "gocdr-mirror+jwt"}
	const origin = "https://cdr.gplatform.org"

	key, _, err := agentcore.LoadOrCreateKey("/var/lib/gocdr-mirror/agent.key", rand.Reader)
	if err != nil {
		log.Fatal(err)
	}
	client := &agentcore.Client{
		Origin:    origin,
		Signer:    &agentcore.Signer{Key: key, Scheme: scheme, Audience: origin},
		HTTP:      agentcore.NewHTTPClient(netip.Addr{}),
		UserAgent: "gocdr-mirror/1.4.3",
	}
	// The mirror id the agent stored after enrolling; until it has one, it enrols first. A key
	// made on an earlier start that never enrolled is simply enrolled now.
	const idFile = "/var/lib/gocdr-mirror/mirror-id"
	id, err := os.ReadFile(idFile)
	if errors.Is(err, fs.ErrNotExist) {
		var enrolment struct {
			MirrorID string `json:"mirrorId"`
		}
		request := map[string]string{"token": "gcdr_enrol_Vq8Lm2Tx9Rk4Hn7Wc1Zp6Jd3Fb5Gs0Ye", "agentVersion": "1.4.3"}
		if err := client.Enrol(ctx, "/api/v1/mirrors/enrolments", request, &enrolment); err != nil {
			log.Fatal(err)
		}
		id = []byte(enrolment.MirrorID)
		err = os.WriteFile(idFile, id, 0o600)
	}
	if err != nil {
		log.Fatal(err)
	}
	client.Signer.Issuer = string(id)

	verifier, err := agentcore.NewBundleVerifier("cdr.gplatform.org/mirror-bundle+a8c375cd+AYOGDQIrhBatOnPNuUQPvM0DSU3+tSvmi6rQzh0h/0dm")
	if err != nil {
		log.Fatal(err)
	}
	floor, err := agentcore.OpenSerialFloor("/var/lib/gocdr-mirror/bundle-floor.json")
	if err != nil {
		log.Fatal(err)
	}
	bundles := &agentcore.BundleSync{Client: client, Path: "/api/v1/mirrors/self/bundle", Verifier: verifier, Floor: floor}
	for {
		b, err := bundles.Next(ctx)
		switch {
		case err != nil:
			log.Print(err)
		case b != nil && !b.Expired(time.Now()):
			// Decode b.Payload as the product's bundle, render its files, and put them in place
			// with an Applier: all or none, the old files back if the reload or probe fails.
		}
		time.Sleep(agentcore.PollDelay(5*time.Minute, time.Minute, err))
	}
}
