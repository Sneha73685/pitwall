# Development image: Vite dev server with HMR, source mounted as a
# volume by docker-compose.yml. Not a production build (M7 work).
FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
