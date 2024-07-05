import os
import json
import importlib.util
from ..config_loader import graphql_schema_path
from ariadne import load_schema_from_path, ObjectType, QueryType, MutationType, make_executable_schema
from ariadne.asgi import GraphQL
from graphql import build_ast_schema, parse
from graphql.language.visitor import Visitor, visit


RESOLVERS_CONFIG_PATH = "resolvers-config.json"
GRAPHQL_SCHEMA_PATH = graphql_schema_path

type_defs = load_schema_from_path(GRAPHQL_SCHEMA_PATH)
query = QueryType()
mutation = MutationType()


def import_from_path(path):
    spec = importlib.util.spec_from_file_location("module.name", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def proxy_resolver(_, info, **kwargs):
    event = {
        "arguments": kwargs
    }
    if resolver := resolvers.get(info.field_name):
        return resolver(event, None)
    raise KeyError("Resolver Not Found!")


with open(RESOLVERS_CONFIG_PATH, "r") as fp:
    resolver_configs = json.load(fp)

query_resolvers = {
    query: import_from_path(config["resolver_path"]).lambda_handler
    for query, config in resolver_configs["queries"].items()
}

mutation_resolvers = {
    mutation: import_from_path(config["resolver_path"]).lambda_handler
    for mutation, config in resolver_configs["mutations"].items()
}

for name in query_resolvers:
    query.set_field(name, proxy_resolver)

for name in mutation_resolvers:
    mutation.set_field(name, proxy_resolver)

resolvers = query_resolvers | mutation_resolvers

schema = make_executable_schema(type_defs, query, mutation)
app = GraphQL(schema, debug=True)
