# E-mails Auth Supabase (hors repo)

Le wording et le branding du mail de confirmation ne vivent pas dans ce dépôt. Ils sont envoyés par le projet Supabase `phyuijjekxtjvipjtdfv`.

## Où aller

1. [Dashboard Supabase](https://supabase.com/dashboard/project/phyuijjekxtjvipjtdfv/auth/templates)
2. Authentication → Email Templates
3. Authentication → URL Configuration (`Site URL` = `https://tracker.prometheus-fit.com`)

## Quoi changer

| Template | Sujet cible | Corps |
|---|---|---|
| Confirm signup | Confirme ton compte Prometheus | Logo Prometheus, pas « powered by Supabase », bouton « Confirmer mon e-mail » |
| Reset password | Réinitialise ton mot de passe Prometheus | Même branding |
| Magic link | Connexion Prometheus | Même branding |

Valeurs à utiliser :

- Nom de l’expéditeur : `Prometheus`
- Couleur d’accent : `#2563eb`
- Lien de redirection : `{{ .ConfirmationURL }}` (ne pas le réécrire à la main)

Ce changement est une action Dashboard. Il n’est pas livré par une PR Git.
