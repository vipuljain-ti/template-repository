import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';
import * as path from 'path';
import { graphql, buildSchema, getIntrospectionQuery } from 'graphql';
import { ApiGatewayRefNestedStack } from './api-gateway-ref-nested-stack';



const loadVtlTemplates = () => {
    const templatesPath = path.join(__dirname, '../generated_vtl_new.json');
    try {
      const templatesContent = fs.readFileSync(templatesPath, 'utf8');
      return JSON.parse(templatesContent);
    } catch (error) {
      console.error('Failed to load VTL templates:', error);
      return {};
    }
  };
  
interface SpecJson {
    paths: {
        [path: string]: {
            [method: string]: {
                operationId: string;
            };
        };
    };
}

const vtlTemplates = loadVtlTemplates();

interface ApiGatewayNestedStackProps extends cdk.NestedStackProps {
  graphqlApi: appsync.GraphqlApi;
  apiGatewayAppSyncRole: iam.IRole;
  specJson: SpecJson;
}

export class ApiGatewayNestedStack extends cdk.NestedStack {
  public readonly apiGatewayAppSyncRole: iam.Role;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayNestedStackProps) {
    super(scope, id, props);

    const specJson: SpecJson = props.specJson;

    
    const apiNestedStack = new ApiGatewayRefNestedStack(this, `${id}ApiGatewayRefNestedStack`, {
    });
    this.api = apiNestedStack.apiGateway;

    new cdk.CfnOutput(this, `${id}ApiGatewayURL`, {
        value: this.api.url
      });

    let previousMethod: apigateway.Method | undefined;

    const addIntegration = (typeName: string, fieldName: string, httpMethod: string, operationId: string) => {
      console.log(`Adding integration for field name: ${fieldName}`)
        if (!fieldName || typeof fieldName !== 'string' || fieldName.trim() === '') {
            console.error(`Invalid fieldName for operationId: ${operationId}`);
            return;
          }
        const appsyncEndpoint = props.graphqlApi.graphqlUrl;
        const resource = this.api.root.addResource(fieldName);

        const templates = vtlTemplates[operationId];
        if (!templates) {
            console.warn(`VTL templates for operation ${operationId} not found, integration could not be performed`);
            return
        }
        const { request_vtl, response_vtl } = templates;

        const integration = new apigateway.HttpIntegration(appsyncEndpoint, {
            httpMethod: 'POST',
            options: {
            credentialsRole: props.apiGatewayAppSyncRole,
            integrationResponses: [{
                statusCode: '200',
                responseTemplates: {
                'application/json': response_vtl
                },
                responseParameters: {
                'method.response.header.Content-Type': "'application/json'"
                },
                contentHandling: apigateway.ContentHandling.CONVERT_TO_TEXT,
            }],
            requestTemplates: {
                'application/json': request_vtl
            },
            passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
            requestParameters: {
                'integration.request.header.x-api-key': "method.request.header.x-api-key"
            }
            },
            proxy: false,
        });
        
        
        const method = resource.addMethod(httpMethod.toUpperCase(), integration, {
            requestParameters: {
            'method.request.header.x-api-key': true
            },
            methodResponses: [{
            statusCode: '200',
            responseModels: {
                'application/json': apigateway.Model.EMPTY_MODEL,
            },
            responseParameters: {
                'method.response.header.Content-Type': true,
            },
            }],
        });
        if (previousMethod) {
          method.node.addDependency(previousMethod);
        }
        previousMethod = method;
    };

    Object.entries(specJson.paths).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([httpMethod, details]) => {
            const operationId = details.operationId;
            const graphqlOperationName = this.translateOperationIdToGraphQLName(operationId);
            const operationType = this.determineOperationType(graphqlOperationName);
            addIntegration(operationType, graphqlOperationName, httpMethod.toUpperCase(), operationId);
        });
    });
  }

  private translateOperationIdToGraphQLName(operationId: string): string {
    return operationId;
  }

  private determineOperationType(operationName: string): string {
    const schemaPath = path.join(__dirname, '../schema.graphql');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const schema = buildSchema(schemaContent);
  
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
  
    if (queryType && queryType.getFields()[operationName]) {
      return 'Query';
    }
  
    if (mutationType && mutationType.getFields()[operationName]) {
      return 'Mutation';
    }
  
    console.warn(`Operation ${operationName} not found in schema. Defaulting to Query.`);
    return 'Query';
  }
}