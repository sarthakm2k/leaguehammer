FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/TournamentAuction.Api/TournamentAuction.Api.csproj backend/TournamentAuction.Api/
RUN dotnet restore backend/TournamentAuction.Api/TournamentAuction.Api.csproj
COPY backend/TournamentAuction.Api/ backend/TournamentAuction.Api/
RUN dotnet publish backend/TournamentAuction.Api/TournamentAuction.Api.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 10000
USER app
CMD ["sh", "-c", "exec dotnet TournamentApp.Api.dll --urls http://0.0.0.0:${PORT:-10000}"]
