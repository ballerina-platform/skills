# XML Rules

Read when checking XML against a schema, binding XML to records, or generating types from an XSD.

## Checking against a schema

To check that a document conforms to an XSD, validate it: `check xmldata:validate(doc, "schemas/order.xsd")`. It
applies the whole schema: element order, required elements, empty values, unknown elements and the root element.
Binding to a record is not validation: it ignores element order and doesn't check the root element's name.

## Types from an XSD

- Generate record types with `bal xsd <schema>.xsd`. Don't edit the generated file; regenerating overwrites it. The
  xsd tool 1.4.0 writes `string x?= "v";` for an optional element with a default, which doesn't compile; 1.4.1 fixes it
  (`bal tool update xsd`).
- As of xmldata 1.7, binding to the generated types differs from the schema in three ways:
  - Elements the record doesn't declare are dropped silently, even though the generated records are closed. Parse
    with `{allowDataProjection: false}` to reject them (library#9840).
  - An empty element (`<note/>`) fails for a `string` field, though `xs:string` allows it (library#9838). Read such
    values from the validated XML, or bind to your own record with `string?` for those fields (`<note/>` gives `()`).
  - An optional element with an XSD `default` becomes a record default, so an absent element reads as the default
    (library#9839). Where "not sent" must differ from "sent with the default", check the XML for the element.
