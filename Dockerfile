# ЭТАП 1: Сборка Бэкенда
FROM golang:1.25-alpine AS backend-build
WORKDIR /app
# Копируем всё содержимое папки бэкенда
COPY core-backend/ .

# Используем существующий go.mod и скачиваем зависимости
RUN go mod download && \
	go build -o server ./cmd/server/main.go

# ЭТАП 2: Сборка Фронтенда
FROM node:18 AS frontend-build
WORKDIR /app
COPY frontend-ui/package*.json ./
RUN npm install
COPY frontend-ui/ .
RUN npm run build

# ЭТАП 3: Финальный образ (Nginx)
FROM nginx:alpine
# Копируем бинарник бэкенда
COPY --from=backend-build /app/server /usr/local/bin/server
# Копируем статику фронтенда
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# Добавляем пользовательский конфиг Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 10000
CMD ["sh", "-c", "/usr/local/bin/server & nginx -g 'daemon off;'"]
