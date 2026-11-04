# Entreguei App — Android

Versão Android nativa do Entreguei App, feita com React Native, Expo, TypeScript e SQLite. Os dados ficam no dispositivo e podem ser usados sem internet. A versão web na pasta principal continua independente.

## Compilar e instalar localmente no Windows

O JDK 17 e as ferramentas Android já estão instalados nesta máquina. O SDK está em `C:\Android\Sdk`.

Para compilar um APK de depuração:

```powershell
cd C:\Desenvolvimento\entregueiapp\android-app\android
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME = 'C:\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
.\gradlew.bat assembleDebug
```

O APK fica em `android\app\build\outputs\apk\debug\app-debug.apk`.

Para instalar diretamente em um celular Android:

1. Ative **Opções do desenvolvedor** e **Depuração USB** no aparelho.
2. Conecte-o com um cabo USB que suporte dados e aceite a autorização de depuração mostrada na tela do celular.
3. No PowerShell, defina `ANDROID_HOME` como acima e execute `& "$env:ANDROID_HOME\platform-tools\adb.exe" devices -l`.
4. Quando o aparelho aparecer como `device`, execute `.\gradlew.bat installDebug` na pasta `android-app\android`.

Se aparecer `unauthorized`, desbloqueie o celular e aceite o aviso RSA. Se a lista estiver vazia, tente outro cabo/porta USB ou instale o driver USB do fabricante. Não é necessário emulador.

## Gerar um APK de teste pela nuvem (EAS)

O perfil `preview` gera um APK instalável diretamente no celular, sem instalar Android SDK nesta máquina.

1. Abra um terminal na pasta `android-app`.
2. Entre na sua conta Expo: `npx.cmd eas-cli@latest login`. O login é feito no seu computador; não compartilhe senha ou token.
3. Confirme a conta com `npx.cmd eas-cli@latest whoami`.
4. Associe este projeto à sua conta Expo: `npx.cmd eas-cli@latest init`. Confirme a criação/vinculação quando solicitado.
5. Inicie o build: `npx.cmd eas-cli@latest build --platform android --profile preview`.
6. Quando o EAS concluir, abra o link do build no celular e instale o APK. Se o Android pedir, autorize a instalação desta fonte.

Cada APK já instalado precisa ser substituído por uma nova build para receber atualizações de interface, ícones e tela de abertura.

O primeiro build pedirá para criar ou configurar uma chave de assinatura Android. Para este APK de teste, aceite a configuração gerenciada pelo EAS.

No PowerShell do Windows, use o sufixo `.cmd` como nos comandos acima para evitar a política de execução de scripts do PowerShell. O build envia o projeto `android-app` ao serviço EAS para compilação.

## Executar em desenvolvimento

1. Instale o Node.js.
2. Na pasta `android-app`, execute `npm ci`.
3. Execute `npm start` para iniciar o servidor Expo.
4. Para compilar e abrir localmente, use os comandos da seção **Compilar e instalar localmente no Windows**. Para emulador, também é necessário criar e iniciar um dispositivo virtual no Android Studio.

O projeto usa módulos nativos e Expo SDK 58; para testar no aparelho, use um development build compatível com esse SDK. Expo Go pode não incluir a mesma versão do SDK.

## Funcionalidades implementadas

- Cadastro, edição e exclusão de bairros e valores por entrega.
- Registro e exclusão de entregas com data, horário e cópia do nome/valor do bairro.
- Consulta por data, resumo semanal e configuração opcional de diária.
- Armazenamento SQLite local e backup JSON.
- Importação do backup JSON exportado pela versão web.
- Ícones Lucide integrados como componentes nativos, sem depender de carregamento pela internet.
- Ícone de aplicativo, ícone adaptável do Android e splash screen com a marca Entreguei.

Para transferir dados da versão web, exporte o backup nela e use **Bairros > Importar backup** no app. A importação substitui os dados atuais do aplicativo.

O escopo e os critérios de conclusão estão em [`../plan.md`](../plan.md).
