# ===== Builder Stage =====
# Use the full Node.js image to build our dependencies
FROM node:22-alpine AS builder

# Set the working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
# This includes devDependencies if you had any, which is fine for building
COPY package.json package-lock.json ./
RUN npm ci --production

# ===== Production Stage =====
# Use a slim, secure base image for the final product
FROM node:22-alpine

WORKDIR /usr/src/app

# Set the default MongoDB URI to the docker host's MongoDB instance
ENV MONGO_URI="mongodb://host.docker.internal:27017/rocketchat?replicaSet=rs01"

# Copy dependencies from the builder stage
# --production flag ensures only production dependencies are copied
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy the application source code
COPY watchdog.js .
COPY LICENSE .

# The command to run the app
CMD [ "node", "watchdog.js" ]
