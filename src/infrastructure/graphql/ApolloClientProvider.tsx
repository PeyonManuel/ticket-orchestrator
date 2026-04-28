"use client";

import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { useMemo } from "react";

function makeClient() {
  return new ApolloClient({
    link: new HttpLink({ uri: "/api/graphql" }),
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            boardColumns: { merge: false },
            tickets: { merge: false },
            releaseVersions: { merge: false },
          },
        },
      },
    }),
  });
}

export function ApolloClientProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => makeClient(), []);
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
