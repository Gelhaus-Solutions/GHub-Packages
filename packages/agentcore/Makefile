# The agentcore module's build, test and lint, in one place. A Go module, so pnpm's workspace
# leaves it alone. Written for GNU make 3.81, the one macOS ships.

GO ?= go

# Go runs git status to stamp the build. Without this, git may take .git/index.lock to refresh
# the index, and a commit made in the same moment by another session then fails.
export GIT_OPTIONAL_LOCKS = 0

.PHONY: build test lint typecheck clean

# A library: build compiles every package and writes nothing.
build:
	CGO_ENABLED=0 $(GO) build -trimpath ./...

test:
	$(GO) test ./...

# go vet, gofmt and a tidy go.mod.
lint:
	$(GO) vet ./...
	@unformatted="$$(gofmt -l .)"; \
	if [ -n "$$unformatted" ]; then echo "gofmt would rewrite:" >&2; echo "$$unformatted" >&2; exit 1; fi
	$(GO) mod tidy -diff

typecheck:
	$(GO) vet ./...

clean:
	rm -rf bin .turbo
