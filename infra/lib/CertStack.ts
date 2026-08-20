import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from "constructs";


export interface CertStackProps extends cdk.StackProps {
  hostedZoneId?: string;
  zoneName?: string;
}

export class CertStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: CertStackProps) {
    super(scope, id, props);

    const hostedZoneId = props?.hostedZoneId || process.env.HOSTED_ZONE_ID || this.node.tryGetContext('hostedZoneId');
    const zoneName = props?.zoneName || process.env.ZONE_NAME || this.node.tryGetContext('zoneName') || 'resume.grtmkr.com';

    if (!hostedZoneId) {
      throw new Error('hostedZoneId is required. Provide it via props, HOSTED_ZONE_ID env var, or CDK context.');
    }

    const zone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId,
        zoneName,
      },
    );

    const certificate = new acm.Certificate(this, "SiteCertificate", {
      domainName: zoneName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    new secretsmanager.Secret(this, 'CertArnSecret', {
      secretName: '/resumesite/global-cert-arn',
      secretStringValue: cdk.SecretValue.unsafePlainText(certificate.certificateArn),
      replicaRegions: [
        {
          region: 'us-east-2',
        },
      ],
    });
  }
}
