import { createYoga, type Plugin } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { typeDefs } from "@/infrastructure/graphql/schema";
import { resolvers } from "@/infrastructure/graphql/resolvers";
import type { GraphQLContext } from "@/infrastructure/graphql/resolvers";
import { createRequestLoaders } from "@/infrastructure/persistence/loaders";
import { logger } from "@/infrastructure/observability/logger";

const schema = makeExecutableSchema({ typeDefs, resolvers });

const operationLoggerPlugin: Plugin<GraphQLContext> = {
  onExecute({ args }) {
    const start = performance.now();
    const opName = args.operationName ?? "anonymous";
    const orgId = (args.contextValue as GraphQLContext).orgId;
    const userId = (args.contextValue as GraphQLContext).userId;
    return {
      onExecuteDone({ result }) {
        const ms = Math.round(performance.now() - start);
        const hasErrors =
          result && typeof result === "object" && "errors" in result && Array.isArray(result.errors) && result.errors.length > 0;
        if (hasErrors) {
          logger.error("graphql", `${opName} ✖ ${ms}ms`, {
            orgId, userId,
            errors: (result as { errors: Array<{ message: string }> }).errors.map((e) => e.message),
          });
        } else {
          logger.info("graphql", `${opName} ✓ ${ms}ms`, { orgId, userId });
        }
      },
    };
  },
};

const yoga = createYoga<object, GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  plugins: [operationLoggerPlugin],
  async context(): Promise<GraphQLContext> {
    // Same-origin: Clerk auto-includes the session cookie. `auth()` reads it.
    const { userId, orgId, orgRole } = await auth();
    if (!userId) {
      logger.warn("auth", "graphql request without userId");
      return { userId: null, orgId: null, isAdmin: false, loaders: null };
    }

    // Org admin role takes precedence over user-level metadata.
    let isAdmin = orgRole === "org:admin";
    if (!isAdmin) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      isAdmin = (user.publicMetadata as { role?: string } | null)?.role === "admin";
    }

    // No active organization → user can authenticate but cannot access tenant data.
    if (!orgId) {
      logger.warn("auth", "userId resolved but orgId missing", { userId });
      return { userId, orgId: null, isAdmin, loaders: null };
    }

    return {
      userId,
      orgId,
      isAdmin,
      loaders: createRequestLoaders(orgId),
    };
  },
  fetchAPI: { Response },
});

export const GET = yoga.fetch;
export const POST = yoga.fetch;

