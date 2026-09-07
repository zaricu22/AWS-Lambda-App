# CLAUDE.md

Guidance for Claude Code when working in this repo. See `README.md` for the full setup/deploy walkthrough — this file covers conventions and gotchas.

## What this is

Angular + AWS Lambda + DynamoDB reference app with exactly two features: login and a read-only items list. It's the serverless sibling of `../AWS-Sample-App` (Fargate + RDS Postgres) — same frontend and Cognito setup, deliberately different backend so the two can be compared. See `README.md`'s "Why Lambda + DynamoDB" table before assuming this app should behave like the other one.

## No local backend — don't try to make one

Unlike the Fargate sample, there is no `docker-compose up` / `mvn spring-boot:run` loop here. The Lambda has no local emulator in this sample by design (see README). To test a backend change:

```bash
cd backend && mvn package               # rebuilds target/items-lambda.jar
cd infra && npx cdk deploy LambdaBackendStack
```

Local frontend dev (`cd frontend && npm start`) always talks to the real, already-deployed API Gateway via `frontend/public/runtime-config.json`'s `apiBaseUrl`.

## Stack naming — do not rename back to the Fargate sample's stack ids

`infra/bin/infra.ts` deliberately uses `LambdaAuthStack` / `LambdaDataStack` / `LambdaBackendStack` / `LambdaFrontendStack`, not the plain `AuthStack` etc. used in `../AWS-Sample-App`. CloudFormation identifies stacks by name within an account+region, not by source folder — reusing the other sample's stack names here would update/collide with *that* sample's already-deployed stacks if both are deployed to the same AWS account. Keep the `Lambda` prefix.

## DynamoDB seed data is create-only

`infra/lib/data-stack.ts`'s `AwsCustomResource` seeds the `items` table's 8 rows in its `onCreate` handler only. Editing `SEED_ITEMS` after the table already exists does nothing on redeploy — CloudFormation only re-runs a custom resource when its input parameters change in a way it detects, and this one has no update handler at all. To reseed: destroy and recreate `LambdaDataStack`, or add an `onUpdate` handler / a separate migration Lambda if this needs to support live schema evolution later.

## Backend Java version, deliberately

`backend/pom.xml` has no Spring Boot dependency on purpose (see README "Why not Spring Boot on Lambda") — don't add `spring-boot-starter-web` or `aws-serverless-java-container-springboot` here without discussing it first; that would quietly reintroduce the cold-start cost this sample exists to avoid.

## JWT validation lives in infra, not in code

`ItemsHandler.java` does not check the caller's token at all — `infra/lib/backend-stack.ts`'s `HttpUserPoolAuthorizer` rejects unauthorized requests at the API Gateway layer before the Lambda is invoked. If you're debugging an "unauthorized" error, check the authorizer config and the Cognito token, not the Lambda code.

## Machine-specific gotcha: Avast TLS interception

This machine's Avast installs its own root CA for HTTPS inspection, which can break JVM tools whose trust store doesn't include it (see `../AWS-Sample-App/CLAUDE.md` for the full workaround). It's less likely to bite here since nothing in this app's runtime path makes JVM-level HTTPS calls to Cognito directly (API Gateway does that, not app code) — but `mvn package`'s own dependency downloads from Maven Central are still JVM HTTPS traffic and can hit the same PKIX validation failure. If `mvn package` fails with a certificate error, apply the same cacerts workaround documented there.

Playwright/Chromium's `net::ERR_NETWORK_ACCESS_DENIED` gotcha (also documented there) applies unchanged to this project's `e2e/` suite.

## Project naming

Project name is `aws-lambda-app` — `infra/`, `frontend/`, `e2e`, and the backend Maven `artifactId`/`name` are all set to this. Exception: the Cognito Hosted UI domain prefix defaults to `items-lambda-app` (`infra/bin/infra.ts`'s `cognitoDomainPrefix`) — Cognito domain prefixes cannot contain the reserved word `aws` (see the Fargate sample's CLAUDE.md for how that was confirmed against the API).
