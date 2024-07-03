import json

def load_json_file(file_path):
    with open(file_path, 'r') as file:
        return json.load(file)

def resolve_ref(spec, ref):
    parts = ref.split('/')[1:]
    result = spec
    for part in parts:
        result = result.get(part, {})
    return result

def resolve_refs(spec, obj):
    if isinstance(obj, dict):
        if '$ref' in obj:
            ref_path = obj['$ref']
            return resolve_refs(spec, resolve_ref(spec, ref_path))
        else:
            for key, value in obj.items():
                obj[key] = resolve_refs(spec, value)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            obj[i] = resolve_refs(spec, item)
    return obj

def transform_to_custom_format(openapi_spec):
    custom_format = {}
    
    for path, methods in openapi_spec['paths'].items():
        for method, details in methods.items():
            if type(details) is not dict:
                continue
            operation_id = details.get('operationId')
            if operation_id:
                resolved_details = resolve_refs(openapi_spec, details)
                custom_format[operation_id] = {
                    "operationType": method.upper(),
                    "requestBodySchema": resolved_details.get('requestBody', {}),
                    "queryParameters": [param['name'] + ": " + param['schema']['type'] for param in resolved_details.get('parameters', []) if 'schema' in param],
                    "responseBodySchema": {}
                }
                
                responses = resolved_details.get('responses', {})
                for status_code, response in responses.items():
                    if 'content' in response:
                        for content_type, content_details in response['content'].items():
                            if 'schema' in content_details:
                                custom_format[operation_id]['responseBodySchema'][status_code] = content_details['schema']
    
    return custom_format

def main():
    openapi_path = 'openapi.json'
    output_path = 'rest_api_parsed.json'
    
    openapi_spec = load_json_file(openapi_path)
    custom_format = transform_to_custom_format(openapi_spec)
    with open(output_path, 'w') as file:
        json.dump(custom_format, file, indent=2)
    
    print(f"Transformation complete. Output written to {output_path}")

if __name__ == "__main__":
    main()
