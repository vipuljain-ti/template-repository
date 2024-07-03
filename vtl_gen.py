import json
from graphql import parse, validate, GraphQLSchema
from graphql.utilities import build_client_schema


def load_json(filename):
    with open(filename, 'r') as file:
        return json.load(file)

rest_api_data = load_json('rest_api_parsed.json')
graphql_schema = load_json('output.json')

graphql_schema_object = build_client_schema(graphql_schema['data'])

graphql_operations = {}
for type_ in graphql_schema['data']['__schema']['types']:
    if type_['name'] == 'Query' or type_['name'] == 'Mutation':
        for field in type_['fields']:
            operation_name = field['name']
            graphql_operations[operation_name] = {
                'type': type_['name'],
                'args': [arg['name'] for arg in field['args']]
            }

def generate_selection_set_from_schema(schema, depth=0, schema_definitions=None):
    """
    Recursively generates a GraphQL selection set from a JSON schema.
    """
    indent = '  ' * depth
    selection_set = []

    if schema_definitions is None:
        schema_definitions = {}

    if 'properties' in schema:
        for prop, details in schema['properties'].items():
            if details.get('type') == 'object':
                nested_selection = generate_selection_set_from_schema(details, depth + 1, schema_definitions)
                if nested_selection:  # Check if nested selection is not empty
                    selection_set.append(f"{indent}{prop} {{\n{nested_selection}\n{indent}}}")
            elif details.get('type') == 'array' and 'items' in details:
                item_details = details['items']
                if isinstance(item_details, dict) and ('properties' in item_details or '$ref' in item_details):
                    nested_selection = generate_selection_set_from_schema(item_details, depth + 1, schema_definitions)
                    if nested_selection:  # Check if nested selection is not empty
                        selection_set.append(f"{indent}{prop} {{\n{nested_selection}\n{indent}}}")
                else:
                    selection_set.append(f"{indent}{prop}")
            else:
                selection_set.append(f"{indent}{prop}")
    elif '$ref' in schema:
        ref_path = schema['$ref'].split('/')[-1]  # Assumes last segment is the key in definitions
        ref_schema = schema_definitions.get(ref_path, {})
        nested_selection = generate_selection_set_from_schema(ref_schema, depth, schema_definitions)
        if nested_selection:  # Check if nested selection is not empty
            return nested_selection
    elif 'allOf' in schema:
        allOf_selections = []
        for subschema in schema['allOf']:
            nested_selection = generate_selection_set_from_schema(subschema, depth, schema_definitions)
            if nested_selection:  # Check if nested selection is not empty
                allOf_selections.append(nested_selection)
        selection_set.extend(allOf_selections)

    return ',\n'.join(selection_set).strip()

def generate_request_vtl(endpoint, details, graphql_operation):
    operation_type = 'query' if graphql_operations[endpoint]['type'] == 'Query' else 'mutation'
    args_vtl = []
    args_mapping = []
    seen_params = set()  # To track and avoid duplicating parameters

    for arg in graphql_operations[endpoint]['args']:
        if 'queryParameters' in details:
            for param in details['queryParameters']:
                param_name, _ = param.split(":")
                if param_name not in seen_params:  # Check if the param has already been processed
                    # Use escaped double quotes for parameters
                    args_vtl.append(f"#set(${param_name} = $input.params(\"{param_name}\"))")
                    args_mapping.append(f"{param_name}: ${param_name}")
                    seen_params.add(param_name)  # Mark this param as processed
        elif 'requestBodySchema' in details and details['requestBodySchema']:
            args_vtl.append("#set($input = $util.parseJson($input.body))")
            for key in details['requestBodySchema'].get('properties', {}):
                if key not in seen_params:  # Ensure requestBodySchema properties are not duplicated
                    args_mapping.append(f"{key}: ${key}")
                    seen_params.add(key)

    response_body_schema = details.get('responseBodySchema', {}).get('200', {})
    if not response_body_schema:
        response_body_schema = details.get('requestBodySchema', {}).get('content', {}).get('application/json', {}).get('schema', {})
    selection_set = generate_selection_set_from_schema(response_body_schema) if response_body_schema else ""

    print(f"Selection set for endpoint: {endpoint} ---> {selection_set}")

    args_str = ', '.join(args_mapping)
    operation_generic_name = "MyQuery" if operation_type == 'query' else "MyMutation"
    operation_call = f"{endpoint}({args_str})" if args_str else f"{endpoint}"

    # Prepare the query part without extra curly braces
    query_part = f"{operation_call} {{ {selection_set} }}" if selection_set else f"{operation_call}"
    query_part_formatted = query_part.replace('{ ', '{\\n    ').replace(' }', '\\n  }').replace(', ', ',\\n    ').replace('"', '\\"')
    query_string = f"{operation_type} {operation_generic_name} {{\\n  {query_part_formatted}\\n}}".replace("\n", "\\n")

    request_vtl = "\n".join(args_vtl) + f"\n{{\n  \"query\": \"{query_string}\",\n  \"variables\": null,\n  \"operationName\": \"{operation_generic_name}\"\n}}"
    return request_vtl.strip()

def generate_response_vtl(endpoint):
    return f"""
$input.path('$').data.{endpoint}
""".strip()

def generate_vtl_templates(rest_api_data, graphql_operations):
    vtl_templates = {}
    for endpoint, details in rest_api_data.items():
        if endpoint in graphql_operations:
            request_vtl = generate_request_vtl(endpoint, details, graphql_operations[endpoint])
            # Extract just the query string for parsing and validation
            query_string = request_vtl.split('\"query\": \"')[1].split('\",\n  \"variables\"')[0].replace('\\n', '\n').replace('\\"', '"')
            response_vtl = generate_response_vtl(endpoint)
            vtl_templates[endpoint] = {
                'request_vtl': request_vtl,
                'response_vtl': response_vtl
            }
            # try:
            #     # Parse the query string to a GraphQL query document
            #     query_document = parse(query_string)
            #     # Validate the query document against the schema
            #     validation_errors = validate(graphql_schema_object, query_document)
            #     # validation_errors = False
            #     if not validation_errors:  # If no errors, the query is valid
            #         response_vtl = generate_response_vtl(endpoint)
            #         vtl_templates[endpoint] = {
            #             'request_vtl': request_vtl,
            #             'response_vtl': response_vtl
            #         }
            #     else:
            #         print(f"Validation errors for endpoint {endpoint}: {validation_errors}")
            # except Exception as e:
            #     print(f"Error parsing or validating query for endpoint {endpoint}: {e}")
    return vtl_templates

vtl_templates = generate_vtl_templates(rest_api_data, graphql_operations)

def save_vtl_templates(vtl_templates, filename='generated_vtl_new.json'):
    with open(filename, 'w') as file:
        json.dump(vtl_templates, file, indent=2)

save_vtl_templates(vtl_templates)
