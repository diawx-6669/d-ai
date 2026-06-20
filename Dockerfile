# STAGE 1: Build Go backend
FROM golang:1.25-alpine AS backend-build
WORKDIR /app
COPY core-backend/ .
RUN go mod download && \
	go build -o server ./cmd/server/main.go

# STAGE 2: Build frontend
FROM node:18 AS frontend-build
WORKDIR /app
COPY frontend-ui/package*.json ./
RUN npm install
COPY frontend-ui/ .
RUN npm run build

# STAGE 3: Final image (Nginx + Go binary)
FROM nginx:alpine

# envsubst (from the "gettext" package) is used below to inject Render's $PORT
# into the nginx config at container startup.
# NOTE: on Alpine the package is called "gettext", NOT "gettext-base" --
# "gettext-base" is the Debian/Ubuntu package name and does not exist in apk.
# (nginx:alpine technically already ships envsubst for its own template
# mechanism, but we install it explicitly so this doesn't silently break if
# the base image ever changes.)
RUN apk add --no-cache gettext

# A sane local-dev default so the container doesn't crash if PORT isn't set
# (e.g. when testing with `docker run` without -e PORT=...). Render will
# always override this with its own value at runtime.
ENV PORT=80

COPY --from=backend-build /app/server /usr/local/bin/server
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# Ship the nginx config as a TEMPLATE (contains the literal placeholder
# ${PORT}), not as a final config -- it gets rendered into a real config at
# container start, once we actually know what port Render gave us.
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

EXPOSE 80

# 1. Start the Go backend on a FIXED internal port (8080) -- this is set via
#    "PORT=8080" only for this one command, so it does NOT see/use Render's
#    real $PORT. This is intentional: Go and Nginx must NOT share a port.
# 2. Render the nginx template using envsubst, but restrict substitution to
#    the single variable '${PORT}'. This is important: nginx itself uses
#    $host, $remote_addr, $scheme, etc. in its config (same $ syntax!) --
#    passing the explicit '${PORT}' list stops envsubst from touching those
#    and blanking them out.
# 3. Start Nginx in the foreground, now listening on Render's real $PORT --
#    this is the port Render actually checks for "no open ports detected".
CMD ["/bin/sh", "-c", "PORT=8080 /usr/local/bin/server & envsubst '${PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
