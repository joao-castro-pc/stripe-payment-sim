# Single-container ("monolith") image: builds the React app and the .NET API,
# then the API serves the built SPA from wwwroot. One image, one origin.
# Build context is the repo root so we can reach both frontend/ and backend/.

# ---- 1. Build the frontend ----
FROM node:24-slim AS frontend
WORKDIR /fe
# Install deps first (cached until the lockfile changes).
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --legacy-peer-deps
# Then the source. VITE_API_BASE is left unset -> the app uses same-origin "".
COPY frontend/ ./
# Publishable key (pk_test_...) is NOT secret but IS baked into the JS at build
# time, so it must be passed as a build arg.
ARG VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
RUN npm run build

# ---- 2. Build/publish the backend ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS backend
WORKDIR /src
COPY backend/PaymentSim.Api.csproj ./backend/
RUN dotnet restore backend/PaymentSim.Api.csproj
COPY backend/ ./backend/
# Skip the OpenAPI-to-frontend generation here (that folder isn't in this stage;
# the committed frontend/openapi.json already drove the frontend build above).
RUN dotnet publish backend/PaymentSim.Api.csproj -c Release -o /app/publish \
    -p:OpenApiGenerateDocumentsOnBuild=false

# ---- 3. Runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=backend /app/publish ./
# The SPA is served as static files from wwwroot.
COPY --from=frontend /fe/dist ./wwwroot
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "PaymentSim.Api.dll"]
