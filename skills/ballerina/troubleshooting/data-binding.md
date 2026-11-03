# Data Binding Issues — jsondata / xmldata

`ballerina/data.jsondata` and `ballerina/data.xmldata` handle conversions between Ballerina values and JSON/XML. They're used implicitly by HTTP payload binding and explicitly when calling functions like `jsondata:parseString` or `jsondata:parseAsType`.

## Common errors

| Error / symptom                                                           | Likely cause                                                                              | Fix                                                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `{ballerina/data.jsondata}ConversionError`                                | JSON structure doesn't match the target record                                            | Compare field names, types, nesting. JSON keys are case-sensitive.                               |
| `ConversionError` with `missing required field`                           | A non-optional record field has no corresponding JSON key                                 | Mark the field optional (`string? name`) or give it a default (`string name = ""`)               |
| `ConversionError` with `incompatible type`                                | The JSON value type doesn't match the record field (e.g. `"123"` vs `int`)                | Either change the record field type or transform the JSON before binding                          |
| `cloneWithType` rejects extra fields (`{ballerina/lang.value}ConversionError`) | Target is a closed record; `cloneWithType` does no projection (`jsondata:parseString`/`parseAsType` drop extra fields by default) | Use `jsondata:parseAsType`, an open record, or list the extra fields explicitly |
| `{ballerina/data.xmldata}ConversionError`                                 | XML structure mismatched the record                                                       | Check element names, namespaces, and attribute handling                                          |
| HTTP `PayloadBindingError` on the service side                            | Incoming body doesn't match the resource function parameter type                          | Verify `Content-Type` and inspect the body against the parameter type                            |
| HTTP `PayloadBindingError` on the client side                             | Response body doesn't match the target type in the client call                            | Enable HTTP trace logs to see the actual response shape, then adjust the target type             |

## Diagnosis approach

1. Enable HTTP trace logs (see [http.md](http.md)) to see the actual JSON/XML payload.
2. Compare the payload structure against the target record type — field names, missing fields, type mismatches.
3. For deeply nested types, bind to `json` (or `xml`) first to confirm the raw payload is valid, then narrow to the precise record.

## Controlling binding behaviour

```ballerina
import ballerina/data.jsondata;

// Default behaviour — open record, optional fields and defaults are honored
type User record {
    string name;
    string? email;     // optional — absent key maps to nil
    int age = 0;       // default value — absent key uses the default
};

// Strict binding — reject unknown fields
type StrictUser record {|
    string name;
    int age;
|};

// Parse with explicit options
// Projection (dropping extra fields) is on by default; its options sit under allowDataProjection
User user = check jsondata:parseString(jsonStr, {
    allowDataProjection: {nilAsOptionalField: true}  // null JSON values become absent optional fields
});
```
