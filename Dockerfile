FROM oven/bun:alpine

COPY package.json ./
COPY bun.lockb ./
COPY src ./

RUN bun install --frozen-lockfile

CMD ["bun", "run", "start"]