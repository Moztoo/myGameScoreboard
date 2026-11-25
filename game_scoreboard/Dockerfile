ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base-python:3.12-alpine3.20
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apk add --no-cache \
    sqlite \
    curl \
    tzdata

COPY requirements.txt /app/
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app/ /app/
COPY CHANGELOG.md /app/CHANGELOG.md
COPY run.sh /run.sh
RUN chmod a+x /run.sh

EXPOSE 8099

CMD [ "/run.sh" ]
