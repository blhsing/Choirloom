import java.awt.Toolkit;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

/** Gives Audiveris a filesystem-based home on hosts without a Windows desktop. */
public final class AudiverisBootstrap {
    public static void main(String[] args) throws Throwable {
        Toolkit toolkit = Toolkit.getDefaultToolkit();
        if (toolkit.getClass().getName().equals("sun.awt.HeadlessToolkit")) {
            var underlying = toolkit.getClass().getDeclaredField("tk");
            underlying.setAccessible(true);
            toolkit = (Toolkit) underlying.get(toolkit);
        }
        Method setProperty = Toolkit.class.getDeclaredMethod("setDesktopProperty", String.class, Object.class);
        setProperty.setAccessible(true);
        setProperty.invoke(toolkit, "Shell.shellFolderManager", "sun.awt.shell.ShellFolderManager");
        try {
            Class.forName("Audiveris").getMethod("main", String[].class).invoke(null, (Object) args);
        } catch (InvocationTargetException failure) {
            throw failure.getCause();
        }
    }
}
