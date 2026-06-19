set shell := ["bash", "-cu"]

default:
    @just --list

install:
    npm install

dev:
    npm run dev

test:
    npm test

lint:
    npm run lint

typecheck:
    npm run typecheck

build:
    npm run build

check: lint typecheck test

server port="8080" input="godaddy-products-export.csv" images_dir="images" output_dir="godaddy-import":
    npx tsx src/index.ts server --port {{port}} --input {{input}} --images-dir {{images_dir}} --output-dir {{output_dir}}

parse input="godaddy-products-export.csv" output="products.json":
    npx tsx src/index.ts parse --input {{input}} --output {{output}}

export input="products.json" output="godaddy-export.csv" images_dir="images" output_dir="godaddy-import":
    npx tsx src/index.ts export --input {{input}} --output {{output}} --images-dir {{images_dir}} --output-dir {{output_dir}}

clean:
    rm -rf dist godaddy-import
