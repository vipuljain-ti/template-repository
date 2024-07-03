import * as cdk from 'aws-cdk-lib';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as fs from 'fs';
import * as path from 'path';
import { buildSchema } from 'graphql';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ApiRefNestedStack } from './gql-api-ref-nested-stack';

interface SpecJson {
    paths: {
      [path: string]: {
        [method: string]: {
          operationId: string;
        };
      };
    };
  }

interface ResolverNestedStackProps extends NestedStackProps {
  apiId: string;
  lambdaExecutionRole: iam.IRole;
  specJson: SpecJson;
}

export class ResolverNestedStack extends NestedStack {
  constructor(scope: Construct, id: string, props: ResolverNestedStackProps) {
    super(scope, id, props);

    const { apiId, lambdaExecutionRole, specJson } = props;

    const apiNestedStack = new ApiRefNestedStack(this, `${id}GqlApiNestedStack`, { apiId });
    const api = apiNestedStack.api;

    Object.entries(specJson.paths).forEach(([specPath, methods]) => {
      Object.entries(methods).forEach(([method, details]) => {
        const operationId = details.operationId;
        const graphqlOperationName = this.translateOperationIdToGraphQLName(operationId);

        const resolverPath = path.join(__dirname, `../resolvers/${operationId}/resolver.py`);

        if (fs.existsSync(resolverPath)) {
            const lambdaFunction = new lambda.Function(this, `${id}${graphqlOperationName}LambdaFunction`, {
            runtime: lambda.Runtime.PYTHON_3_8,
            handler: `resolver.lambda_handler`,
            code: lambda.Code.fromAsset(path.dirname(resolverPath)),
            reservedConcurrentExecutions: 1,
            role: lambdaExecutionRole,
            });
            cdk.Tags.of(lambdaFunction).add('AD', 'aprusty');
            cdk.Tags.of(lambdaFunction).add('Owner', 'prusty.abhishek@codenation.co.in');
            cdk.Tags.of(lambdaFunction).add('Project', 'OpenAPI Builder');

            const lambdaDataSource = api.addLambdaDataSource(`${graphqlOperationName}DataSource`, lambdaFunction);

            lambdaDataSource.createResolver(graphqlOperationName+"Resolver", {
            typeName: this.determineOperationType(graphqlOperationName),
            fieldName: graphqlOperationName,
            requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
            responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
            });
        }
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
