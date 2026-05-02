import { ApolloLink, Observable } from "@apollo/client";
import { logger } from "@/infrastructure/observability/logger";

/**
 * Apollo client middleware that logs every operation with timing + variables.
 *
 * Lives in the client `link` chain before the HttpLink. Gated by the same
 * NEXT_PUBLIC_DEV_LOGS flag the rest of the logger uses — when off, this is a
 * pass-through with no overhead.
 */
export function makeLoggerLink(): ApolloLink {
  return new ApolloLink((operation, forward) => {
    const start = performance.now();
    const { operationName, variables } = operation;
    const opType = operation.query.definitions
      .map((d) => ("operation" in d ? d.operation : null))
      .find(Boolean) ?? "operation";

    return new Observable((observer) => {
      const sub = forward(operation).subscribe({
        next: (result) => {
          const ms = Math.round(performance.now() - start);
          const errors = result.errors ?? [];
          if (errors.length > 0) {
            logger.error("apollo", `${opType} ${operationName} ✖ ${ms}ms`, {
              variables,
              errors: errors.map((e) => e.message),
            });
          } else {
            logger.info("apollo", `${opType} ${operationName} ✓ ${ms}ms`, {
              variables,
              data: result.data,
            });
          }
          observer.next(result);
        },
        error: (err) => {
          const ms = Math.round(performance.now() - start);
          logger.error("apollo", `${opType} ${operationName} ✖ network ${ms}ms`, {
            variables,
            err: err instanceof Error ? err.message : err,
          });
          observer.error(err);
        },
        complete: () => observer.complete(),
      });
      return () => sub.unsubscribe();
    });
  });
}
