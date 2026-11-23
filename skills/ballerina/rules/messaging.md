# Event-Driven Service Rules

Read when building anything that sends to or receives from a broker or queue — a producer or a consumer (Kafka, RabbitMQ, NATS, JMS, MQTT, Solace, …) — or a change-data-capture listener.

Attaching the service is connector-specific — read that section for the one you are using.
The acknowledgement and raw-payload sections hold for any broker. The last section is
Kafka's concrete API; other connectors express the same ideas with their own calls, so look
up the acknowledgement API of the one you are using (Step 2) rather than assuming Kafka's.

## Producing (Kafka)

When a successful `send` must mean the record is stored and not duplicated by retries, set `acks: kafka:ACKS_ALL` and `enableIdempotence: true` on the producer rather than relying on the defaults (`bal discover type ProducerConfiguration -p ballerinax/kafka` shows them: `ACKS_SINGLE` and `false` as of kafka 4.6.8, library#9837). Idempotence needs `ACKS_ALL`: with another `acks` value, `init` panics (as of kafka 4.6.8).

## Attaching the service

Connectors put the destination in one of three places, and you cannot infer which from the kind of connector — check the one in front of you: `bal discover service -p <org>/<name>` prints its service type, the methods to implement and their rules.

**1. On the listener config.** `service on myListener { ... }` is then the complete attach form; there is no channel string to look for.

```text
listener kafka:Listener lsn = new (bootstrapServers = url, topics = ["orders"]);
service on lsn { ... }
```

**2. As the service attach path**, between the service type and `on`:

```text
service <pkg>:<ServiceType> "<destination>" on <listener>
```

**3. In a service-level annotation.**

```text
@solace:ServiceConfig { queueName: "orders" }
service on lsn { ... }
```

Note that "change-data-capture" does not settle it — Salesforce CDC takes an attach path, `ballerinax/cdc` does not.

**How loudly a missing destination fails depends on the form.** Only form 2 is caught by the compiler:

```text
rabbitmq, nats   ->  ERROR Invalid service attach point. Only string literals are allowed.   (build)
salesforce       ->  error: Invalid channel name: 'null'                                     (startup)
forms 1 and 3    ->  builds and runs, and the service receives nothing
```

`kafka:ConsumerConfiguration.topics` is itself optional, so a Kafka listener with no topics compiles and subscribes to nothing. For forms 1 and 3 there is no error to wait for — confirm the destination is set before you run.

## The acknowledgement boundary (any broker)

Check first whether the remote method receives **one** message or a **batch** — the signature tells you. RabbitMQ and NATS deliver a single message; Kafka delivers an array. When the requirement is at-least-once delivery — "if X fails, do not acknowledge the message" — where you acknowledge *is* the design, and batch delivery is what makes it easy to get wrong: messages are then lost only under load, never in a single-message test.

- Decide, before writing the loop, which failures block the acknowledgement:

  | Failure | Blocks the ack? |
  | ------- | --------------- |
  | Persistence or another required side effect | **Yes** — do not acknowledge; arrange redelivery |
  | Malformed payload that can never succeed | No — log and skip, or the consumer wedges on a poison message forever |
  | Downstream call the design tolerates failing | No — record the outcome and carry on |

- Check whether the acknowledgement call is **per-message or batch-scoped** before using it. A batch-scoped call placed inside the message loop acknowledges messages the loop has not processed yet — including ones it deliberately skipped.
- For at-least-once delivery with `ballerinax/solace`, set `ackMode: solace:CLIENT_ACK` and settle every message yourself: `caller->ack(message)` after the work succeeds, `caller->nack(message)` (requeue) when it fails, `caller->nack(message, requeue = false)` for one that can never succeed (it goes to the dead message queue, if the queue has one). Catch every failure inside `onMessage`, and take the plain `solace:Message` and parse its payload there: a returned error, a panic or a binding failure leaves the message unsettled until the connection drops. A requeued message comes back at once, so give the queue a redelivery delay or limit. Don't rely on `AUTO_ACK`, the default: as of solace 1.2.1 it acknowledges before `onMessage` runs, though the `Caller.ack` doc says otherwise, so a failed message is lost (library#9834).
- Switching off automatic acknowledgement is only safe together with the above. Manual acknowledgement done carelessly is worse than an automatic mode that acknowledges only after the handler succeeds.

## Preserving the raw payload (any broker)

Need the untouched payload (audit, replay, dead-letter)? Bind the message body as `string` or `byte[]` and persist it **before** parsing. Binding straight to a typed record discards the original bytes, so a parse failure loses the event entirely — usually the exact event you most wanted to keep.

## Kafka specifics

- `caller->'commit()` commits **every offset the consumer holds — the whole batch**, not the record in hand. Call it **once, after the loop**.
- To block the ack on failure, `caller->seek(...)` back to that record's offset and return **without** committing. Without the `seek` the record is not redelivered in-session: the consumer position has already advanced past it.
- `caller->commitOffset(...)` takes the **next offset to consume**, not the offset just processed. To acknowledge record `N`, commit `N + 1` — passing `N` acknowledges nothing and redelivers it forever.
- Set `autoCommit: false` only together with the above.
- Record inclusion keeps the raw bytes and puts `offset` in scope for `seek`:

  ```ballerina
  type RawOrderRecord record {|
      *kafka:AnydataConsumerRecord;
      string value;
  |};
  ```

For a worked at-least-once skeleton and the measured commit-scope behaviour, see [../troubleshooting/messaging.md](../troubleshooting/messaging.md).
