# Messaging Connectors — Kafka, RabbitMQ, NATS, JMS

Messaging connectors share recurring failure modes: broker reachability, auth, destination existence, and consumer/producer config mismatches.

## Kafka

| Error / symptom                     | Likely cause                                       | Fix                                                                                          |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Connection refused` to broker      | Kafka not running, wrong bootstrap server, network | Verify the broker address in `kafka:ProducerConfiguration` / `kafka:ConsumerConfiguration`   |
| `Leader not available`              | Topic missing, or broker in election               | Create the topic; wait for leader election to finish                                          |
| `SASL authentication failure`       | Wrong credentials or wrong SASL mechanism          | Verify `securityProtocol` and SASL configuration                                              |
| Consumer not receiving messages     | Wrong `groupId` or `offsetReset`                   | Use a unique `groupId` per consumer group; set `offsetReset: kafka:OFFSET_RESET_EARLIEST` during testing |
| Messages published but not consumed | Listener up but not dispatching                    | Check `pollingInterval`, `concurrentConsumers`, and that the service is attached              |

Reference consumer config:

```ballerina
kafka:ConsumerConfiguration consumerConfig = {
    groupId: "my-group",          // must be unique per consumer group
    topics: ["my-topic"],
    pollingInterval: 1,           // seconds between polls
    offsetReset: kafka:OFFSET_RESET_EARLIEST,  // start from the beginning for new groups
    autoCommit: false             // only with the commit handling below — see next section
};
```

### The service contract is not in the API dump

`kafka:Service` is declared as a bare marker (`distinct service object { }`) and the remote
method is validated by a compiler plugin, so a library API dump shows an empty service body.
That is not a tool failure and does not mean the service has no methods. The contract is:

```text
service on kafkaListener {
    remote function onConsumerRecord(kafka:Caller caller, OrderRecord[] records) returns error?
    remote function onError(kafka:Error err) returns error?          // optional
}
```

`kafka:Caller` is optional, but without it you cannot commit or seek manually. This is the
shape, not a copyable snippet — the bodies are yours to write.

Kafka has **no channel string** on the service — topics are set on the listener via `topics`.
`service on myListener` is the complete attach form.

### Manual commit — offsets acknowledge more than you think

`autoCommit: false` alone is not safer than auto-commit; it is worse, unless the commit
boundary is handled deliberately. Measured against a 3-record batch (offsets 0, 1, 2),
committing after processing only the first record:

| Call | Committed offset | Result |
| ---- | ---------------- | ------ |
| `caller->'commit()` | `3` | **entire batch acknowledged**, including the two records not yet processed |
| `caller->commitOffset([rec.offset])` (`0`) | `0` | acknowledges **nothing** — the record is redelivered forever |
| `caller->commitOffset([{partition: rec.offset.partition, offset: rec.offset.offset + 1}])` | `1` | exactly that one record acknowledged |

`'commit()` is batch-scoped and `commitOffset()` takes the **next** offset to consume. The
common bug is committing inside the record loop, which acknowledges records the loop
skipped or has not reached — silent message loss that single-message testing never reveals.

Shape for at-least-once delivery:

```ballerina
// Record inclusion is what puts `offset` (and the raw `value`) in scope for seek/audit.
type OrderRecord record {|
    *kafka:AnydataConsumerRecord;
    string value;
|};

remote function onConsumerRecord(kafka:Caller caller, OrderRecord[] orderRecords)
        returns error? {
    foreach OrderRecord orderRecord in orderRecords {
        error? persistResult = persistOrder(orderRecord);
        if persistResult is error {
            // Blocking failure: rewind so it is redelivered, and do NOT commit.
            kafka:Error? seekResult = caller->seek(orderRecord.offset);
            if seekResult is kafka:Error {
                // The rewind itself failed, so the record will not come back on the next
                // poll. Surface it rather than returning as if the failure was handled.
                log:printError("rewind failed", 'error = seekResult);
                return seekResult;
            }
            return;
        }
        // Non-blocking failures (bad payload, tolerated downstream error) log and continue.
    }
    check caller->'commit();   // once, after the whole batch
}
```

Symptoms of getting this wrong: messages disappear under load but never in single-message
tests; `kafka-consumer-groups.sh --describe` shows `LAG 0` while records are still in
flight; or a poison message pins the consumer and lag never drains.

## RabbitMQ

| Error / symptom                     | Likely cause                                                                                  | Fix                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Connection refused`                | RabbitMQ not running, wrong host/port (default 5672)                                          | Verify host/port; check the management UI                                                                                  |
| `ACCESS_REFUSED`                    | Wrong user/password or missing vhost permissions                                              | Confirm credentials and vhost configuration                                                                                |
| `NOT_FOUND` on queue/exchange       | Resource not declared on the broker                                                           | Declare the queue first (`queueDeclare()`) or create it through the management UI                                          |
| Messages not delivered              | Wrong routing key or exchange type                                                            | Producer and consumer must agree on exchange type and routing key                                                          |
| Messages published but not consumed | Exchange/queue binding mismatch — type, routing key, or arguments differ                      | Ensure `queueBind()` uses the same exchange name, routing key, and arguments as the exchange declaration                   |

> Ballerina's RabbitMQ client requires queues to exist before consumption. Use `channel->queueDeclare({queueName: "my-queue"})` (or pre-create the queue on the broker). Consuming from a missing queue triggers `NOT_FOUND` and closes the channel.

## NATS

`import ballerinax/nats;`

| Error / symptom                                         | Likely cause                                                                            | Fix                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Connection refused` on port 4222                       | NATS not running or wrong address                                                       | Default is `nats://localhost:4222` — verify the URL                                                            |
| Messages not received                                   | Subject mismatch                                                                        | Subjects are case-sensitive and must match exactly — check spelling                                            |
| Subscriber receives nothing despite correct subject     | Queue group with only one member, or unintended queue-group routing                     | Audit `queueName`; without a queue group, every subscriber gets every message                                  |
| `Authorization Violation`                               | Missing or wrong credentials                                                            | Configure `auth` in `nats:ConnectionConfiguration` (token, user/password, or NKey)                             |
| Messages lost                                           | Core NATS is fire-and-forget                                                            | Use NATS JetStream (`ballerinax/nats.jetstream`) for at-least-once delivery                                    |

Subject wildcards:

| Pattern | Matches                                   | Example                                                  |
| ------- | ----------------------------------------- | -------------------------------------------------------- |
| `*`     | One token                                 | `orders.*` matches `orders.new`, not `orders.us.new`     |
| `>`     | One or more tokens (must be the last seg) | `orders.>` matches both `orders.new` and `orders.us.new` |

Queue groups distribute messages across members (load balancing). Without a queue group, every subscriber receives every message (fan-out).

## JMS

`import ballerinax/java.jms;`

| Error / symptom                             | Likely cause                                                            | Fix                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Connection refused`                        | Broker not running or wrong URL                                         | Verify `initialContextFactory` and `providerUrl` in the connection config                          |
| Messages not consumed                       | `connection.start()` not called — JMS connections begin in stopped mode | Call `start()` on the connection before consuming                                                  |
| `Queue not found` / `Destination not found` | Queue/topic missing on the broker                                       | Create the destination on the broker, or enable auto-creation if supported                         |
| `Authentication failed`                     | Wrong credentials                                                       | Verify username/password in `jms:ConnectionConfiguration`                                          |
| `ClassNotFoundException` for the provider   | Provider JAR missing from classpath                                     | Add the JMS provider JAR (e.g. ActiveMQ client) under `[[platform.java21.dependency]]` in `Ballerina.toml` |

Provider notes:

- **ActiveMQ** — `initialContextFactory = "org.apache.activemq.jndi.ActiveMQInitialContextFactory"`, `providerUrl = "tcp://localhost:61616"`. Requires the ActiveMQ client JAR as a platform dependency.
- **IBM MQ** — Use the IBM MQ JMS client JAR. Connection factory setup typically uses JNDI or direct configuration with `MQQueueConnectionFactory`. Refer to IBM MQ's documentation for the required properties.

> JMS in Ballerina runs over Java interop. Provider JARs must be declared in `Ballerina.toml` under `[[platform.java21.dependency]]` (or `java25`, the 2201.14.x target).
