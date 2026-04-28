import { createYoga } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { typeDefs } from "@/infrastructure/graphql/schema";
import { resolvers } from "@/infrastructure/graphql/resolvers";
import type { GraphQLContext } from "@/infrastructure/graphql/resolvers";
import { createRequestLoaders } from "@/infrastructure/persistence/loaders";

const schema = makeExecutableSchema({ typeDefs, resolvers });

const yoga = createYoga<object, GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  async context(): Promise<GraphQLContext> {
    // Same-origin: Clerk auto-includes the session cookie. `auth()` reads it.
    const { userId, orgId, orgRole } = await auth();
    if (!userId) {
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

