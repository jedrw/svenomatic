FROM oven/bun:latest AS build

COPY package.json ./
COPY bun.lockb ./
COPY src ./

RUN bun install --frozen-lockfile
RUN bun build index.ts --compile --minify --outfile ./svenomatic

FROM scratch

COPY --from=build /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2
COPY --from=build /lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
COPY --from=build /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6
COPY --from=build /lib/x86_64-linux-gnu/libpthread.so.0 /lib/x86_64-linux-gnu/libpthread.so.0
COPY --from=build /lib/x86_64-linux-gnu/libdl.so.2 /lib/x86_64-linux-gnu/libdl.so.2
COPY --from=build /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/libm.so.6

COPY --from=build /home/bun/app/svenomatic ./
CMD ["./svenomatic"]