import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  accessLink?: string
  groupLink?: string
  plan?: string
}

const Email = ({
  firstName,
  accessLink = 'https://leadsbooster.com.br',
  groupLink = 'https://chat.whatsapp.com/FqKaeXxk3Xz3McHx34TGm9',
  plan,
}: Props) => {
  const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Sua assinatura LeadsBooster foi confirmada — acesse seu painel</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Bem-vindo(a) ao LeadsBooster 🚀</Heading>
          <Text style={text}>{greeting}</Text>
          <Text style={text}>
            Sua assinatura foi <strong>confirmada</strong>
            {plan ? ` (plano ${plan})` : ''}. Tudo pronto para você começar a
            prospectar com inteligência.
          </Text>

          <Section style={ctaSection}>
            <Button style={button} href={accessLink}>
              Acessar meu painel
            </Button>
          </Section>

          <Text style={text}>
            Se o botão não funcionar, copie e cole este link no navegador:
            <br />
            <Link href={accessLink} style={link}>
              {accessLink}
            </Link>
          </Text>

          <Hr style={hr} />

          <Heading as="h2" style={h2}>
            👥 Grupo exclusivo de clientes
          </Heading>
          <Text style={text}>
            Entre no nosso grupo no WhatsApp para receber suporte, novidades e
            treinamentos:
          </Text>
          <Section style={ctaSection}>
            <Button style={buttonSecondary} href={groupLink}>
              Entrar no grupo
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Qualquer dúvida, é só responder este e-mail. Bem-vindo(a) ao time!
            <br />
            Equipe LeadsBooster
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Bem-vindo(a) ao LeadsBooster — acesse seu painel',
  displayName: 'Boas-vindas LeadsBooster',
  previewData: {
    firstName: 'Maria',
    accessLink: 'https://leadsbooster.com.br',
    groupLink: 'https://chat.whatsapp.com/FqKaeXxk3Xz3McHx34TGm9',
    plan: 'pro',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#0f172a', fontSize: '24px', fontWeight: '700', margin: '0 0 16px' }
const h2 = { color: '#0f172a', fontSize: '18px', fontWeight: '600', margin: '8px 0 12px' }
const text = { color: '#334155', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = {
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  display: 'inline-block',
}
const buttonSecondary = {
  backgroundColor: '#10b981',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  display: 'inline-block',
}
const link = { color: '#3b82f6', wordBreak: 'break-all' as const }
const hr = { borderColor: '#e2e8f0', margin: '28px 0' }
const footer = { color: '#64748b', fontSize: '13px', lineHeight: '20px', margin: '0' }
