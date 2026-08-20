import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';


export interface InfraStackProps extends cdk.StackProps {
  hostedZoneId?: string;
  zoneName?: string;
  connectionArn?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: InfraStackProps) {
    super(scope, id, props);

    const hostedZoneId = props?.hostedZoneId || process.env.HOSTED_ZONE_ID || this.node.tryGetContext('hostedZoneId');
    const zoneName = props?.zoneName || process.env.ZONE_NAME || this.node.tryGetContext('zoneName') || 'resume.grtmkr.com';
    const connectionArn = props?.connectionArn || process.env.CODESTAR_CONNECTION_ARN || this.node.tryGetContext('connectionArn');
    const githubOwner = props?.githubOwner || process.env.GITHUB_OWNER || this.node.tryGetContext('githubOwner') || 'gorkster';
    const githubRepo = props?.githubRepo || process.env.GITHUB_REPO || this.node.tryGetContext('githubRepo') || 'resumesite';
    const githubBranch = props?.githubBranch || process.env.GITHUB_BRANCH || this.node.tryGetContext('githubBranch') || 'main';

    if (!hostedZoneId) {
      throw new Error('hostedZoneId is required. Provide it via props, HOSTED_ZONE_ID env var, or CDK context.');
    }
    if (!connectionArn) {
      throw new Error('connectionArn is required. Provide it via props, CODESTAR_CONNECTION_ARN env var, or CDK context.');
    }

    const siteBucket = new s3.Bucket(this, 'ResumeSiteBucket', {
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName,
    });

    // This is deprecated, but it creates a cert for us with a custom resource so we don't have to do it.  The replacement construct does not handle this for us.
    // We would have to do the work of creating the cert and the lambda cross region, so gonna skip it for now
    // const certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
    //   domainName: 'resume.grtmkr.com',
    //   hostedZone: zone,
    //   region: 'us-east-1',
    // });
    const certSecret = secretsmanager.Secret.fromSecretNameV2(this, 'CertSecret', '/resumesite/global-cert-arn');
    const myCertificate = acm.Certificate.fromCertificateArn(this, 'SiteCertificateImport', certSecret.secretValue.unsafeUnwrap());

    // Secret holding environment variables for build and runtime (initialized as empty JSON)
    const appEnvSecret = new secretsmanager.Secret(this, 'AppEnvSecret', {
      secretName: '/resumesite/env',
      description: 'Environment variables for ResumeSite build and runtime',
      secretStringValue: cdk.SecretValue.unsafePlainText('{}'),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      domainNames: [zoneName],
      certificate: myCertificate,
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      defaultRootObject: 'index.html',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
    });

    new route53.ARecord(this, 'SiteAliasRecord', {
      recordName: zoneName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    });

    new route53.AaaaRecord(this, 'SiteAliasRecordAAAA', {
      recordName: zoneName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    });

    const pipeline = new codepipeline.Pipeline(this, 'ResumeSitePipeline', {
      pipelineName: 'ResumeSiteDeployPipeline',
      crossAccountKeys: false,
    });


    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.CodeStarConnectionsSourceAction({
      actionName: 'GitHub_Source',
      owner: githubOwner,
      repo: githubRepo,
      branch: githubBranch,
      connectionArn,
      output: sourceOutput,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });


    const buildProject = new codebuild.PipelineProject(this, 'HugoBuild', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
    });

    // Grant CodeBuild permission to read the environment variables secret
    appEnvSecret.grantRead(buildProject);

    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Hugo_Build',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [buildAction],
    });


    const deployAction = new codepipeline_actions.S3DeployAction({
      actionName: 'Deploy_to_S3',
      input: buildOutput,
      bucket: siteBucket,
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });


    const invalidateProject = new codebuild.PipelineProject(this, 'InvalidateCache', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              `aws cloudfront create-invalidation --distribution-id \${DISTRIBUTION_ID} --paths "/*"`
            ]
          }
        }
      }),
      environmentVariables: {
        DISTRIBUTION_ID: { value: distribution.distributionId },
      }
    });

    distribution.grantCreateInvalidation(invalidateProject.role!);

    const invalidateAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Invalidate_CloudFront',
      project: invalidateProject,
      input: sourceOutput,
    });

    pipeline.addStage({
      stageName: 'Invalidate',
      actions: [invalidateAction],
    });
  }
}
