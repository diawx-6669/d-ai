FROM golang:1.22-alpine AS builder
WORKDIR /app
# Copy full project first so `go mod tidy` can inspect imports and populate go.sum
COPY . .
# Resolve modules and generate go.sum inside builder
RUN go mod tidy
RUN go build -o /bin/server ./cmd/server

FROM alpine:3.20
COPY --from=builder /bin/server /bin/server
EXPOSE 8080
ENTRYPOINT ["/bin/server"]
