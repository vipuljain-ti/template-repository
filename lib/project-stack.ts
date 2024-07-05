import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import { graphql, buildSchema, getIntrospectionQuery } from 'graphql';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ResolverNestedStack } from './resolver-nested-stack';
import { DynamoDBNestedStack } from './dynamodb-nested-stack';
import { IAMNestedStack } from './iam-nested-stack';
import { ApiGatewayNestedStack } from './api-gateway-nested-stack';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as zlib from 'zlib';
import * as util from 'util';

const gzip = util.promisify(zlib.gzip);

const app = new cdk.App();
const MAX_RESOURCES_PER_STACK = 50;
const APP_NAME = "YourProject";
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

export class ProjectStack extends cdk.Stack {
  private readonly id: string;
  public readonly apiGatewayAppSyncRole: iam.Role;
  public readonly lambdaExecutionRole: iam.Role;
  public readonly graphqlApi: appsync.GraphqlApi;
  public readonly mainApiGateway: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.id = id;

    const schemaFile = path.join(__dirname, '../schema.graphql')

    this.graphqlApi = new appsync.GraphqlApi(this, 'GraphQLApi', {
      name: `${APP_NAME}${id}GraphQLServer`,
      schema: appsync.SchemaFile.fromAsset(schemaFile),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
      },
    });

    new cdk.CfnOutput(this, 'GraphQLAPIURL', {
      value: this.graphqlApi.graphqlUrl,
    });

    new cdk.CfnOutput(this, 'GraphQLAPIID', {
      value: this.graphqlApi.apiId,
    });

    if (this.node.tryGetContext('deployGqlApiOnly')) {
      return;
    }

    const iamNestedStack = new IAMNestedStack(this, `${id}IAMNestedStack`);
    this.lambdaExecutionRole = iamNestedStack.lambdaExecutionRole
    this.apiGatewayAppSyncRole = iamNestedStack.apiGatewayAppSyncRole

    const specPath = path.join(__dirname, '../openapi.json');
    const specContent = fs.readFileSync(specPath, 'utf8');
    const specJson: SpecJson = JSON.parse(specContent);
    
    this.mainApiGateway = new apigateway.RestApi(this, `${id}${APP_NAME}MainApiGateway`, {
      restApiName: `${APP_NAME}MainService`,
      description: `Main API Gateway for ${APP_NAME}`,
    });

    const apiGatewayUrls: { [key: string]: string } = {};
    const pathMappings: { [key: string]: string } = {};
    this.createAllNestedStacks(specJson, apiGatewayUrls, pathMappings)

    new cdk.CfnOutput(this, `${id}MainApiGatewayURL`, {
      value: this.mainApiGateway.url,
    });

    this.createLambdaProxy(apiGatewayUrls, pathMappings);
  }

  private async createLambdaProxy(apiGatewayUrls: { [key: string]: string }, pathMappings: { [key: string]: string }) {
    const resolvedApiGatewayUrls = Object.fromEntries(
      Object.entries(apiGatewayUrls).map(([key, url]) => [key, cdk.Fn.sub(url)])
    );
    
    const compressedApiGatewayUrls = (await gzip(JSON.stringify(resolvedApiGatewayUrls))).toString('base64');
    const compressedPathMappings = (await gzip(JSON.stringify(pathMappings))).toString('base64');

    const lambdaProxy = new lambda.Function(this, 'LambdaProxy', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'lambda_proxy.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda-proxy')),
      environment: {
        COMPRESSED_API_GATEWAY_URLS: compressedApiGatewayUrls,
        COMPRESSED_PATH_MAPPINGS: compressedPathMappings,
      },
    });

    cdk.Tags.of(lambdaProxy).add('AD', 'aprusty');
    cdk.Tags.of(lambdaProxy).add('Owner', 'prusty.abhishek@codenation.co.in');
    cdk.Tags.of(lambdaProxy).add('Project', 'OpenAPI Builder')

    lambdaProxy.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:Invoke'],
      resources: ['*'],
    }));

    const proxyIntegration = new apigateway.LambdaIntegration(lambdaProxy);
    this.mainApiGateway.root.addMethod('ANY', proxyIntegration);
    this.mainApiGateway.root.addProxy({
      defaultIntegration: proxyIntegration,
    });
  }


  private createAllNestedStacks(specJson: SpecJson, apiGatewayUrls: { [key: string]: string }, pathMappings: { [key: string]: string }) {
    let currentBatch: SpecJson['paths'] = {};
    let batchCount = 0;

    Object.entries(specJson.paths).forEach(([path, methods], index) => {
      currentBatch[path] = methods;
      const isLastMethod = index === Object.keys(specJson.paths).length - 1;
      if (Object.keys(currentBatch).length >= MAX_RESOURCES_PER_STACK || isLastMethod) {
        this.createNestedStack(batchCount, currentBatch, apiGatewayUrls, pathMappings);
        currentBatch = {}; // Reset for the next batch
        batchCount++;
      }
    });
  }

  private createNestedStack(batchCount: number, paths: SpecJson['paths'], apiGatewayUrls: { [key: string]: string }, pathMappings: { [key: string]: string }) {
    const stackId = `${this.id}ApiGatewayNestedStack${batchCount}`;
    const partialSpecJson: SpecJson = { paths };

    const nestedApiGatewayStack = new ApiGatewayNestedStack(this, stackId, {
      graphqlApi: this.graphqlApi,
      apiGatewayAppSyncRole: this.apiGatewayAppSyncRole,
      specJson: partialSpecJson,
    });

    new ResolverNestedStack(this, `${this.id}ResolverNestedStack${batchCount}`, {
      apiId: this.graphqlApi.apiId,
      lambdaExecutionRole: this.lambdaExecutionRole,
      specJson: partialSpecJson,
    });

    apiGatewayUrls[`batch${batchCount}`] = nestedApiGatewayStack.api.url;

    Object.entries(paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([httpMethod, details]) => {
          const operationId = details.operationId;
          pathMappings[operationId] = `batch${batchCount}`;
      });
  });

  }
}