import os
import json
import urllib3
import gzip
import base64
import re

http = urllib3.PoolManager()

compressed_api_gateway_urls = os.environ['COMPRESSED_API_GATEWAY_URLS']
compressed_path_mappings = os.environ['COMPRESSED_PATH_MAPPINGS']

api_gateway_urls = json.loads(gzip.decompress(base64.b64decode(compressed_api_gateway_urls)).decode('utf-8'))
path_mappings = json.loads(gzip.decompress(base64.b64decode(compressed_path_mappings)).decode('utf-8'))

def handler(event, context):
    path = event['path']
    batch_key = determine_batch_key(path)

    target_url = api_gateway_urls.get(batch_key)
    if not target_url:
        return {
            'statusCode': 404,
            'body': 'Not Found'
        }

    response = forward_request(target_url, event)
    return response

def determine_batch_key(path):
    for operation, batch_key in path_mappings.items():
        if operation in path: # TODO: Better matching
            return batch_key
    return None

def forward_request(url, event):
    method = event['httpMethod']
    headers = event['headers']
    body = event.get('body', '')

    response = http.request(
        method,
        url + event['path'],
        headers=headers,
        body=body
    )

    return {
        'statusCode': response.status,
        'headers': dict(response.headers),
        'body': response.data.decode('utf-8')
    }
