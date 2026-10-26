FROM node:24-alpine AS base
WORKDIR /srv
COPY package.json package-lock.json ./

FROM base AS app
RUN npm ci --omit=dev
COPY app ./app
USER node
CMD ["node", "app/main.js"]

# Load generator image: includes autocannon (a devDependency), never shipped with the app.
FROM base AS loadtest
RUN npm ci
COPY loadtest ./loadtest
USER node
