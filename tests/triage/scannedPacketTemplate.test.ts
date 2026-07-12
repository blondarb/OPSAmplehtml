import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const templatePath = resolve(
  process.cwd(),
  'infrastructure/triage-ingestion/template.yaml',
)

describe('scanned-packet ingestion SAM safety foundation', () => {
  it('defines private versioned SSE-KMS storage with multipart cleanup and scoped retention', () => {
    const source = readFileSync(templatePath, 'utf8')
    expect(source).toContain('BucketOwnerEnforced')
    expect(source).toContain('BlockPublicAcls: true')
    expect(source).toContain('BlockPublicPolicy: true')
    expect(source).toContain('IgnorePublicAcls: true')
    expect(source).toContain('RestrictPublicBuckets: true')
    expect(source).toContain('Status: Enabled')
    expect(source).toContain('SSEAlgorithm: aws:kms')
    expect(source).toContain('BucketKeyEnabled: true')
    expect(source).toContain('AbortIncompleteMultipartUpload')
    expect(source).toContain('Prefix: quarantine/')
    expect(source).toContain('Prefix: textract-output/')
    expect(source).toContain('aws:SecureTransport')
    expect(source).toContain('s3:x-amz-server-side-encryption')
    expect(source).toContain('s3:x-amz-server-side-encryption-aws-kms-key-id')
    expect(source).not.toContain('AccessControl: Public')
  })

  it('defines encrypted raw SNS-to-SQS delivery with source-bound policies and DLQ', () => {
    const source = readFileSync(templatePath, 'utf8')
    expect(source).toContain('Type: AWS::SNS::Topic')
    expect(source).toContain(
      'TopicName: !Sub AmazonTextract-sevaro-triage-scan-${Environment}-complete',
    )
    expect(source).toContain('Type: AWS::SNS::Subscription')
    expect(source).toContain('RawMessageDelivery: true')
    expect(source).toContain('ScannedPacketSnsDeliveryDeadLetterQueue:')
    expect(source).toContain(
      'deadLetterTargetArn: !GetAtt ScannedPacketSnsDeliveryDeadLetterQueue.Arn',
    )
    expect(source).toContain('Type: AWS::SQS::Queue')
    expect(source).toContain('KmsMasterKeyId: !Ref ClinicalDataKmsKeyArn')
    expect(source).toContain('deadLetterTargetArn: !GetAtt ScannedPacketDeadLetterQueue.Arn')
    expect(source).toContain('Principal:')
    expect(source).toContain('Service: sns.amazonaws.com')
    expect(source).toContain('aws:SourceArn')
    expect(source).toContain('aws:SourceAccount')
    expect(source).toContain('sqs:SendMessage')
    expect(source.match(/MessageRetentionPeriod: 1209600/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('constrains the Textract publish role against confused-deputy use', () => {
    const source = readFileSync(templatePath, 'utf8')
    expect(source).toContain('Service: textract.amazonaws.com')
    expect(source).toContain('ArnLike:')
    expect(source).toContain('arn:${AWS::Partition}:textract:${AWS::Region}:${AWS::AccountId}:*')
    expect(source).toContain('sns:Publish')
    expect(source).toContain('Resource: !Ref TextractCompletionTopic')
    expect(source).toContain('Sid: EncryptCompletionNotifications')
    expect(source).toContain('kms:GenerateDataKey*')
    expect(source).toContain('kms:Decrypt')
  })

  it('wires one bounded completion worker with partial-batch failures and least-privilege paths', () => {
    const source = readFileSync(templatePath, 'utf8')
    expect(source).toContain('Handler: src/workers/triageScannedPacketWorker.handler')
    expect(source).toContain('Timeout: 900')
    expect(source).toContain('BatchSize: 1')
    expect(source).toContain('ReportBatchItemFailures')
    expect(source).toContain('MaximumConcurrency: !Ref WorkerMaximumConcurrency')
    expect(source).toMatch(
      /WorkerMaximumConcurrency:\s+Type: Number\s+Default: 2\s+MinValue: 2/,
    )
    expect(source).toContain('textract:GetDocumentTextDetection')
    expect(source).toContain('${ScannedPacketBucket.Arn}/control/*')
    expect(source).toContain('${ScannedPacketBucket.Arn}/validated/*')
    expect(source).toContain('${ScannedPacketBucket.Arn}/review/*')
    expect(source).toContain('TRIAGE_SCANNED_PACKET_MAX_RESULT_REQUESTS')
    expect(source).toContain('DeletionPolicy: Retain')
    expect(source).toContain('MetricName: ApproximateNumberOfMessagesVisible')
    expect(source).toContain('MetricName: ApproximateAgeOfOldestMessage')
    expect(source).toContain('SnsDeliveryDeadLetterAlarm:')
    expect(source).not.toMatch(/Effect: Allow\s+Action: s3:\*/)
  })

  it('keeps deployment integration outputs opaque and contains no patient fixtures or secrets', () => {
    const source = readFileSync(templatePath, 'utf8')
    expect(source).toContain('ScannedPacketBucketName:')
    expect(source).toContain('TextractCompletionTopicArn:')
    expect(source).toContain('TextractPublishRoleArn:')
    expect(source).toContain('CompletionQueueArn:')
    expect(source.toLowerCase()).not.toContain('jane doe')
    expect(source).not.toMatch(/AKIA[0-9A-Z]{16}/)
  })
})
