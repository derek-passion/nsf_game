#! /bin/bash

set -x

export NODE_ENV=development

npm run build
npm run start

