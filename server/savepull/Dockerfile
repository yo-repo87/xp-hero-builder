FROM node:20-alpine
RUN apk add --no-cache android-tools
WORKDIR /app
COPY package.json index.js saves.js ./
ENV ANDROID_ADB_SERVER_PORT=5038
CMD ["node", "index.js"]
