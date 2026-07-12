import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type Intrinsic =
  | { Ref: string }
  | { 'Fn::GetAtt': string }
  | { 'Fn::Sub': string }

type Statement = {
  Sid: string
  Effect: string
  Action: string
  Resource: Intrinsic
  Condition?: Record<string, Record<string, Intrinsic>>
}

type Resource = {
  Type: string
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
  Properties: Record<string, unknown> & {
    Roles?: Intrinsic[]
    PolicyDocument?: { Version: string; Statement: Statement[] }
    Dimensions?: Array<{ Name: string; Value: string | Intrinsic }>
  }
}

type Template = {
  Resources: Record<string, Resource>
}

const templateSource = readFileSync(
  resolve(process.cwd(), 'infrastructure/nova-relay-security/template.yaml'),
  'utf8',
)

// Parse CloudFormation YAML into an object so the assertions target resource
// meaning rather than incidental indentation or source snippets. js-yaml is
// already supplied by the repository's ESLint toolchain.
const rootRequire = createRequire(import.meta.url)
const eslintRequire = createRequire(
  rootRequire.resolve('@eslint/eslintrc/package.json'),
)
const yaml = eslintRequire('js-yaml') as {
  DEFAULT_SCHEMA: { extend(types: unknown[]): unknown }
  Type: new (
    tag: string,
    options: { kind: 'scalar'; construct(value: string): Intrinsic },
  ) => unknown
  load(source: string, options: { schema: unknown }): unknown
}
const schema = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('!Ref', {
    kind: 'scalar',
    construct: (value) => ({ Ref: value }),
  }),
  new yaml.Type('!GetAtt', {
    kind: 'scalar',
    construct: (value) => ({ 'Fn::GetAtt': value }),
  }),
  new yaml.Type('!Sub', {
    kind: 'scalar',
    construct: (value) => ({ 'Fn::Sub': value }),
  }),
])
const template = yaml.load(templateSource, { schema }) as Template

function resource(name: string): Resource {
  const result = template.Resources[name]
  expect(result, `missing resource ${name}`).toBeDefined()
  return result
}

function policyStatements(name: string): Statement[] {
  const statements = resource(name).Properties.PolicyDocument?.Statement
  expect(statements, `missing statements for ${name}`).toBeDefined()
  return statements ?? []
}

describe('Nova relay security infrastructure', () => {
  it('retains and protects an encrypted TTL replay table keyed only by jti', () => {
    const table = resource('RelayReplayTable')

    expect(table.Type).toBe('AWS::DynamoDB::Table')
    expect(table.DeletionPolicy).toBe('Retain')
    expect(table.UpdateReplacePolicy).toBe('Retain')
    expect(table.Properties.DeletionProtectionEnabled).toBe(true)
    expect(table.Properties.TimeToLiveSpecification).toEqual({
      AttributeName: 'expires_at',
      Enabled: true,
    })
    expect(table.Properties.SSESpecification).toEqual({ SSEEnabled: true })
    expect(table.Properties.AttributeDefinitions).toEqual([
      { AttributeName: 'jti', AttributeType: 'S' },
    ])
    expect(table.Properties.KeySchema).toEqual([
      { AttributeName: 'jti', KeyType: 'HASH' },
    ])
  })

  it('grants the task role only PutItem on the replay table', () => {
    const policy = resource('RelayReplayWritePolicy')

    expect(policy.Type).toBe('AWS::IAM::Policy')
    expect(policy.Properties.Roles).toEqual([{ Ref: 'RelayTaskRoleName' }])
    expect(policyStatements('RelayReplayWritePolicy')).toEqual([
      {
        Sid: 'ConditionallyConsumeOpaqueJti',
        Effect: 'Allow',
        Action: 'dynamodb:PutItem',
        Resource: { 'Fn::GetAtt': 'RelayReplayTable.Arn' },
      },
    ])
  })

  it('grants the execution role only secret read and CMK decrypt via regional Secrets Manager', () => {
    const policy = resource('RelaySecretInjectionPolicy')

    expect(policy.Type).toBe('AWS::IAM::Policy')
    expect(policy.Properties.Roles).toEqual([{ Ref: 'RelayExecutionRoleName' }])
    expect(policyStatements('RelaySecretInjectionPolicy')).toEqual([
      {
        Sid: 'ReadOnlyExactRelaySecretReplica',
        Effect: 'Allow',
        Action: 'secretsmanager:GetSecretValue',
        Resource: { Ref: 'RelaySecretReplicaArn' },
      },
      {
        Sid: 'DecryptOnlyRelaySecretKey',
        Effect: 'Allow',
        Action: 'kms:Decrypt',
        Resource: { Ref: 'RelaySecretKmsKeyArn' },
        Condition: {
          StringEquals: {
            'kms:ViaService': {
              'Fn::Sub': 'secretsmanager.${AWS::Region}.amazonaws.com',
            },
          },
        },
      },
    ])
  })

  it('defines both DynamoDB failure alarms with table and PutItem dimensions', () => {
    const alarms = Object.entries(template.Resources).filter(
      ([, candidate]) => candidate.Type === 'AWS::CloudWatch::Alarm',
    )

    expect(alarms.map(([name]) => name).sort()).toEqual([
      'ReplayTableSystemErrorAlarm',
      'ReplayTableThrottleAlarm',
    ])
    expect(
      alarms.map(([, alarm]) => ({
        namespace: alarm.Properties.Namespace,
        metric: alarm.Properties.MetricName,
        dimensions: alarm.Properties.Dimensions,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          namespace: 'AWS/DynamoDB',
          metric: 'ThrottledRequests',
          dimensions: [
            { Name: 'TableName', Value: { Ref: 'RelayReplayTable' } },
            { Name: 'Operation', Value: 'PutItem' },
          ],
        },
        {
          namespace: 'AWS/DynamoDB',
          metric: 'SystemErrors',
          dimensions: [
            { Name: 'TableName', Value: { Ref: 'RelayReplayTable' } },
            { Name: 'Operation', Value: 'PutItem' },
          ],
        },
      ]),
    )
  })

  it('contains no ECS resources or deployment commands', () => {
    expect(
      Object.values(template.Resources).some((candidate) =>
        candidate.Type.startsWith('AWS::ECS::'),
      ),
    ).toBe(false)
    expect(templateSource).not.toMatch(
      /\b(?:aws\s+ecs|sam\s+deploy|aws\s+cloudformation\s+deploy)\b/i,
    )
  })
})
