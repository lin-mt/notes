---
sidebar_position: 2
---

# 在 SpringBoot 中使用 OpenCV

:::tip
\{v} 对应下载的版本号，不可更改
:::

## Windows 安装 OpenCV

1. 从 https://github.com/opencv/opencv/releases 下载对应版本的 opencv-\{v}-windows.exe
2. 双击解压后得到文件：
    1. `opencv\build\java\x64\opencv_java{v}.dll`
    2. `opencv\build\java\x86\opencv_java{v}.dll`
    3. `opencv\build\java\opencv-{v}.jar`
3. （可选）将对应的 dll 文件放入 `java.library.path` 中，通常可以放在 `$JAVA_HOME/bin` 下，或者使用 Spring Boot 自定义应用生命周期自动加载文件

## Spring Boot 添加 OpenCV 库

1. 将 `opencv\build\java\opencv-{v}.jar` 文件放入项目的 `resources/lib` 文件夹下
2. `pom.xml` 添加依赖：

```xml title="pom.xml"
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://maven.apache.org/POM/4.0.0"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <dependencies>
        <dependency>
            <!-- groupId、artifactId、version 可自定义 -->
            <groupId>org.opencv</groupId>
            <artifactId>opencv</artifactId>
            <version>{v}</version>
            <scope>system</scope>
            <systemPath>${pom.basedir}/src/main/resources/lib/opencv-{v}.jar</systemPath>
        </dependency>
    </dependencies>
    <build>
        <finalName>ServerName</finalName>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <!-- 打包时将 dependency 中 scope 为 system 的依赖添加到打包的文件中 -->
                    <includeSystemScope>true</includeSystemScope>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

## Spring Boot 加载 OpenCV

在使用 OpenCV 前需要加载 OpenCV 对应的库

1. 将对应的 dll 文件或 so 文件（Linux服务器编译安装 OpenCV 得到的文件）放入项目的 `resources/lib` 文件夹下
2. 自动加载 dll 或 so 文件：

```java title="ServerLifecycle.java"
@Slf4j
public class ServerLifecycle implements SmartLifecycle {

  static {
    // 使用前必须加载 OpenCV 
    System.loadLibrary(Core.NATIVE_LIBRARY_NAME);
  }
  
  private boolean running = false;

  private void loadOpenCV() {
    File opencvFile;
    String javaLibraryPath = System.getProperty("java.library.path");
    if (StringUtils.isBlank(javaLibraryPath)) {
      log.error("无法获取 java.library.path");
      throw new IllegalStateException();
    }
    log.info("java.library.path：{}", javaLibraryPath);
    String splitChar;
    if (org.apache.commons.lang3.SystemUtils.IS_OS_WINDOWS) {
      splitChar = ";";
      opencvFile = FileUtils.getResourcesFile("lib" + File.separator + "opencv_java{v}.dll");
    } else {
      splitChar = ":";
      opencvFile = FileUtils.getResourcesFile("lib" + File.separator + "libopencv_java{v}.so");
    }
    Set<String> paths = Arrays.stream(javaLibraryPath.split(splitChar)).collect(Collectors.toSet());
    File newFile = null;
    for (String path : paths) {
      if (!FileUtil.exist(path)) {
        continue;
      }
      newFile = new File(SystemUtils.buildPath(path, opencvFile.getName()));
      try {
        if (newFile.exists()) {
          break;
        }
        FileUtil.copy(opencvFile, new File(path), true);
      } catch (Exception exception) {
        log.warn(exception.getMessage());
      }
    }
    if (FileUtil.exist(newFile)) {
      System.load(newFile.getAbsolutePath());
      log.info("OpenCV 已加载：{}", newFile.getAbsolutePath());
    } else {
      log.error("OpenCV 加载失败：{}", opencvFile.getAbsolutePath());
      throw new IllegalStateException();
    }
  }

  
  @Override
  public void start() {
    this.running = true;
    loadOpenCV();
    this.running = false;
  }

  @Override
  public void stop() {
    this.running = false;
  }

  @Override
  public boolean isRunning() {
    return this.running;
  }
}
```

```java title="FileUtils.java"
public class FileUtils {
  @SneakyThrows
  public static File getResourcesFile(String resourcesFile) {
    String filePath =
        SystemUtils.buildPath(SystemUtils.sysTempDirectory(), "resources", resourcesFile);
    File file = new File(filePath);
    file.deleteOnExit();
    FileUtil.touch(file);
    InputStream inputStream = new ClassPathResource(resourcesFile).getInputStream();
    try (OutputStream outputStream = new FileOutputStream(file)) {
      byte[] buffer = new byte[3096];
      int bytesRead;
      while ((bytesRead = inputStream.read(buffer)) != -1) {
        outputStream.write(buffer, 0, bytesRead);
      }
    }
    return file;
  }
}
```

```java title="SystemUtils.java"
public class SystemUtils {
  
  public static String buildPath(String... dirs) {
    if (ArrayUtil.isEmpty(dirs)) {
      throw new IllegalArgumentException("目录不能为空");
    }
    return String.join(
        File.separator, Arrays.stream(dirs).filter(StringUtils::isNotBlank).toList());
  }
  
  public static String sysTempDirectory() {
    String tempPath = System.getProperty("java.io.tmpdir");
    if (!tempPath.endsWith(File.separator)) {
      tempPath = tempPath + File.separator;
    }
    return tempPath + "server_name" + File.separator;
  }
}
```
