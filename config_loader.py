import json
config_path = "project-config.json"
with open(config_path, 'r') as config_file:
    config = json.load(config_file)

# Extract configuration values
project_name = config['Project']['Name']
project_description = config['Project']['Description']
openapi_spec_path = config['OpenAPI-Spec-Path']
graphql_schema_path = config['Graphql-Schema-Path']
vtl_file_path = config['VTL-File-Path']
stack_name = config['Stack']['Name']
max_resources_per_stack = config['Stack']['Max-Resources']
dynamodb_table_name = config['DynamoDB-Table-Name']
